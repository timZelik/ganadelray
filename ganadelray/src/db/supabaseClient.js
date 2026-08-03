// src/db/supabaseClient.js
//
// THE ONLY FILE THAT TOUCHES THE DATABASE. Nothing else imports @supabase/supabase-js.
//
// Two backends behind one API:
//   - Supabase, when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (production).
//   - A local JSON file, otherwise. This is not a toy: it means the ingest,
//     ranking, and enrichment self-checks run on a bare machine with no cloud
//     account and no network, which is how they get verified at all.
//
// Ranking and matching happen in JS rather than SQL on purpose — this is a
// single-creator archive (hundreds of rows, not millions), and keeping the
// business rules in one readable place beats splitting them across a query.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { makeLogger } = require('../utils/logger');
const { DripTimingDefaults } = require('../utils/constants');

const log = makeLogger('db');

const TABLES = [
  'videos',
  'video_metrics',
  'ingest_events',
  'idea_log',
  'banked_ideas',
  'drip_log',
];

const DEFAULT_BOT_STATE = {
  id: 1,
  paused: false,
  paused_at: null,
  unanswered_nudges: 0,
  drip_hour_local: DripTimingDefaults.HOUR_LOCAL,
  timezone: process.env.GANA_TIMEZONE || DripTimingDefaults.TIMEZONE,
  last_inbound_at: null,
  drips_since_pattern: 0,
};

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

// --------------------------------------------------------------------------
// Local-file backend
// --------------------------------------------------------------------------
const LOCAL_PATH = process.env.LOCAL_DB_PATH
  || path.join(process.cwd(), '.data', 'archive.json');

let localCache = null;

function emptyStore() {
  const store = { bot_state: { ...DEFAULT_BOT_STATE } };
  for (const table of TABLES) store[table] = [];
  return store;
}

function readLocal() {
  if (localCache) return localCache;
  try {
    localCache = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
    for (const table of TABLES) if (!localCache[table]) localCache[table] = [];
    if (!localCache.bot_state) localCache.bot_state = { ...DEFAULT_BOT_STATE };
  } catch {
    localCache = emptyStore();
  }
  return localCache;
}

function writeLocal() {
  if (process.env.LOCAL_DB_EPHEMERAL === '1') return;
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(localCache, null, 2));
}

// --------------------------------------------------------------------------
// Supabase backend (lazily constructed so the SDK is never required unless used)
// --------------------------------------------------------------------------
let supabase = null;

function client() {
  if (!supabase) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

async function sb(table, build) {
  const { data, error } = await build(client().from(table));
  if (error) {
    log.error('query failed', { table, message: error.message });
    throw new Error(`supabase ${table}: ${error.message}`);
  }
  return data;
}

function newId() {
  return crypto.randomUUID();
}

// --------------------------------------------------------------------------
// Generic helpers
// --------------------------------------------------------------------------
async function selectAll(table) {
  if (!useSupabase) return readLocal()[table].slice();
  return (await sb(table, (q) => q.select('*'))) || [];
}

async function insertRows(table, rows) {
  if (rows.length === 0) return [];
  if (!useSupabase) {
    const store = readLocal();
    const stamped = rows.map((row) => ({
      id: row.id || newId(),
      created_at: row.created_at || new Date().toISOString(),
      ...row,
    }));
    store[table].push(...stamped);
    writeLocal();
    return stamped;
  }
  return (await sb(table, (q) => q.insert(rows).select())) || [];
}

async function updateRow(table, id, patch) {
  if (!useSupabase) {
    const store = readLocal();
    const row = store[table].find((entry) => entry.id === id);
    if (row) Object.assign(row, patch);
    writeLocal();
    return row || null;
  }
  const data = await sb(table, (q) => q.update(patch).eq('id', id).select());
  return (data && data[0]) || null;
}

// --------------------------------------------------------------------------
// VIDEOS + METRICS
// --------------------------------------------------------------------------
async function getVideos() {
  return selectAll('videos');
}

async function getMetrics() {
  return selectAll('video_metrics');
}

/**
 * Insert new videos and patch existing ones. The ingestor resolves identity in
 * memory first (it needs fuzzy caption matching that SQL can't express cleanly),
 * so this is a dumb writer by design.
 */
async function persistVideos({ inserts, updates }) {
  const created = await insertRows('videos', inserts);
  for (const { id, patch } of updates) {
    await updateRow('videos', id, { ...patch, updated_at: new Date().toISOString() });
  }
  return created;
}

/** Per-window observations. Duplicate (video, metric, window, date) is a no-op. */
async function persistMetrics(rows) {
  if (rows.length === 0) return [];
  if (!useSupabase) {
    const store = readLocal();
    const fresh = rows.filter((row) => !store.video_metrics.some((existing) => (
      existing.video_id === row.video_id
      && existing.metric === row.metric
      && existing.window_days === row.window_days
      && existing.observed_on === row.observed_on
    )));
    return insertRows('video_metrics', fresh);
  }
  const data = await sb('video_metrics', (q) => q
    .upsert(rows, { onConflict: 'video_id,metric,window_days,observed_on', ignoreDuplicates: true })
    .select());
  return data || [];
}

async function recordIngestEvent(event) {
  const rows = await insertRows('ingest_events', [event]);
  return rows[0];
}

async function getLatestIngestEvent() {
  const events = await selectAll('ingest_events');
  return events.sort((a, b) => String(b.captured_on).localeCompare(String(a.captured_on)))[0] || null;
}

// --------------------------------------------------------------------------
// IDEAS
// --------------------------------------------------------------------------
async function saveIdeas(ideas) {
  return insertRows('idea_log', ideas);
}

async function getRecentIdeas(limit = 200) {
  const ideas = await selectAll('idea_log');
  return ideas
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit);
}

async function setIdeaVerdict(id, status, note) {
  return updateRow('idea_log', id, {
    status,
    verdict_note: note || null,
    verdict_at: new Date().toISOString(),
  });
}

async function getLastSentIdeas(limit = 5) {
  const ideas = await getRecentIdeas(50);
  return ideas.filter((idea) => idea.status === 'SENT').slice(0, limit);
}

// --------------------------------------------------------------------------
// IDEA BANK
// --------------------------------------------------------------------------
async function bankIdea(entry) {
  const rows = await insertRows('banked_ideas', entry ? [entry] : []);
  return rows[0];
}

async function getBankedIdeas() {
  return selectAll('banked_ideas');
}

async function markBankedRedripped(id, redripCount) {
  return updateRow('banked_ideas', id, {
    redripped_at: new Date().toISOString(),
    redrip_count: (redripCount || 0) + 1,
  });
}

// --------------------------------------------------------------------------
// DRIP LOG — drip_sent_at / gana_responded_at written on EVERY send.
// --------------------------------------------------------------------------
async function getDripForDate(dripDate) {
  const drips = await selectAll('drip_log');
  return drips.find((drip) => drip.drip_date === dripDate) || null;
}

async function recordDrip({ dripDate, ideaIds, kind }) {
  const rows = await insertRows('drip_log', [{
    drip_date: dripDate,
    drip_sent_at: new Date().toISOString(),
    gana_responded_at: null,
    idea_ids: ideaIds || [],
    kind: kind || 'DRIP',
  }]);
  return rows[0];
}

/** Links the ideas actually sent to the send record — the join the timing learner needs. */
async function attachIdeasToDrip(dripId, ideaIds) {
  return updateRow('drip_log', dripId, { idea_ids: ideaIds });
}

/** Silence is data. This is the other half of the (future) timing learner. */
async function markGanaResponded(at = new Date()) {
  const drips = await selectAll('drip_log');
  const open = drips
    .filter((drip) => !drip.gana_responded_at)
    .sort((a, b) => String(b.drip_sent_at).localeCompare(String(a.drip_sent_at)))[0];
  if (!open) return null;
  return updateRow('drip_log', open.id, { gana_responded_at: at.toISOString() });
}

async function getDrips() {
  return selectAll('drip_log');
}

// --------------------------------------------------------------------------
// BOT STATE
// --------------------------------------------------------------------------
async function getBotState() {
  if (!useSupabase) return { ...readLocal().bot_state };
  const data = await sb('bot_state', (q) => q.select('*').eq('id', 1));
  if (!data || data.length === 0) {
    await sb('bot_state', (q) => q.insert([DEFAULT_BOT_STATE]).select());
    return { ...DEFAULT_BOT_STATE };
  }
  return data[0];
}

async function updateBotState(patch) {
  if (!useSupabase) {
    const store = readLocal();
    Object.assign(store.bot_state, patch, { updated_at: new Date().toISOString() });
    writeLocal();
    return { ...store.bot_state };
  }
  const data = await sb('bot_state', (q) => q
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select());
  return (data && data[0]) || null;
}

// --------------------------------------------------------------------------
// Test/self-check support
// --------------------------------------------------------------------------
function resetLocalStore() {
  if (useSupabase) throw new Error('resetLocalStore is local-backend only');
  localCache = emptyStore();
  writeLocal();
}

module.exports = {
  backend: useSupabase ? 'supabase' : 'local-file',
  isSupabase: useSupabase,
  newId,
  getVideos,
  getMetrics,
  persistVideos,
  persistMetrics,
  recordIngestEvent,
  getLatestIngestEvent,
  saveIdeas,
  getRecentIdeas,
  getLastSentIdeas,
  setIdeaVerdict,
  bankIdea,
  getBankedIdeas,
  markBankedRedripped,
  getDripForDate,
  getDrips,
  recordDrip,
  attachIdeasToDrip,
  markGanaResponded,
  getBotState,
  updateBotState,
  resetLocalStore,
};
