// src/ingest/analyticsIngestor.js
//
// Text in, ranked archive out. NOT a vision parser — Tim runs Gana's TikTok
// Studio screenshots through Gemini and pastes the clean text here.
//
// Three things make this harder than it looks:
//   1. Captions are TRUNCATED. They are the only identity anchor available.
//   2. Dates are mixed absolute ("Posted on Jun 3, 2025") and relative ("2w ago"),
//      and relative ones must resolve against the CAPTURE date, not today.
//   3. The same video recurs across the 7/28/60/365-day windows with different
//      counts. Those are separate observations, never overwrites.

const db = require('../db/supabaseClient');
const { makeLogger } = require('../utils/logger');
const {
  MetricKind, AnalyticsWindowDays, IngestConfig, DatePrecision,
} = require('../utils/constants');
const {
  normalizeCaption, captionKey, keysOverlap, parseCount,
} = require('../utils/text');
const {
  parsePostedDate, datesCompatible, betterDate, toISODate,
} = require('../utils/dates');

const log = makeLogger('ingest');

const SECTION_RE = /^#{1,6}\s*METRIC:/i;
const ROW_RE = /^\s*(?:\d+[.)]\s*)?(.+?)\s*\|\s*([^|]+?)\s*(?:\|\s*(.+?)\s*)?$/;

/** "Captured ~Jul 27, 2026" in the transcript header wins over wall-clock time. */
function detectCaptureDate(text, fallback) {
  const match = String(text).match(
    /captur(?:ed|e)[^\n]*?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},\s*\d{4})/i,
  );
  if (!match) return fallback instanceof Date ? fallback : new Date();
  const parsed = parsePostedDate(match[1], new Date());
  return parsed.date || (fallback instanceof Date ? fallback : new Date());
}

function detectSection(line) {
  if (!SECTION_RE.test(line)) return null;
  const metric = /new\s+followers/i.test(line)
    ? MetricKind.NEW_FOLLOWERS
    : (/new\s+viewers?/i.test(line) ? MetricKind.NEW_VIEWERS : null);
  const windowMatch = line.match(/window:\s*(\d+)\s*day/i);
  const windowDays = windowMatch ? Number(windowMatch[1]) : null;
  if (!metric || !AnalyticsWindowDays.includes(windowDays)) {
    log.warn('unrecognised metric section', { line: line.trim() });
    return null;
  }
  return { metric, windowDays };
}

/** Account-level facts from the Overview / Followers tabs. */
function parseAccountContext(text) {
  const context = {};
  const followers = text.match(/total followers[^\d]*([\d,]+)/i);
  if (followers) context.totalFollowers = parseCount(followers[1]);
  const peak = text.match(/most active:\s*~?\s*(\d{1,2})\s*(am|pm)/i);
  if (peak) {
    let hour = Number(peak[1]) % 12;
    if (peak[2].toLowerCase() === 'pm') hour += 12;
    context.peakHourLocal = hour;
  }
  const female = text.match(/(\d{1,3})%\s*female/i);
  if (female) context.audienceFemalePct = Number(female[1]);
  const search = text.match(/search\s*([\d.]+)%/i);
  if (search) context.searchTrafficPct = Number(search[1]);
  return context;
}

/**
 * Pure function: transcript text -> observation rows. No DB, no side effects,
 * which is what makes the ingest self-check meaningful.
 */
function parseTranscript(text, options = {}) {
  const capturedAt = detectCaptureDate(text, options.capturedAt);
  const lines = String(text).split(/\r?\n/);

  let section = null;
  const rows = [];
  const skipped = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const nextSection = detectSection(trimmed);
    if (nextSection) { section = nextSection; continue; }
    // A non-metric heading ends the current section (e.g. ACCOUNT-LEVEL CONTEXT).
    if (/^#{1,6}\s/.test(trimmed)) { section = null; continue; }
    if (trimmed.startsWith('#')) continue; // comment line
    if (!section) continue;
    if (!trimmed.includes('|')) continue;

    const match = trimmed.match(ROW_RE);
    if (!match) { skipped.push(trimmed); continue; }

    const caption = match[1].trim();
    const value = parseCount(match[2]);
    if (value === null || !caption) { skipped.push(trimmed); continue; }

    const normalized = normalizeCaption(caption);
    rows.push({
      caption,
      normalized,
      key: captionKey(normalized),
      metric: section.metric,
      windowDays: section.windowDays,
      value,
      postedRaw: (match[3] || '').trim(),
      posted: parsePostedDate(match[3], capturedAt),
    });
  }

  if (skipped.length) log.warn('rows skipped', { count: skipped.length, sample: skipped[0] });

  return {
    capturedAt,
    capturedOn: toISODate(capturedAt),
    rows,
    skipped,
    account: parseAccountContext(text),
  };
}

/**
 * Collapse observation rows onto video identities.
 *
 * `existing` is the current archive. Matching is caption-prefix containment
 * gated on date compatibility: a longer re-transcription of the same caption
 * must collide with the shorter one already stored, while two genuinely
 * different videos that happen to share an opening ("4 apartment hacks..." vs
 * "part 2 of 4 apartment hacks...") must not.
 */
function resolveIdentities(rows, existing = []) {
  const working = existing.map((video) => ({
    id: video.id,
    key: video.caption_key,
    anchor: video.caption_anchor,
    posted: {
      date: video.posted_at ? new Date(`${video.posted_at}T00:00:00Z`) : null,
      precision: video.posted_at_precision || DatePrecision.UNKNOWN,
    },
    isNew: false,
    changed: false,
  }));

  const ambiguities = [];
  const assignments = [];

  for (const row of rows) {
    const candidates = working.filter((video) => (
      keysOverlap(row.key, video.key)
      && datesCompatible(row.posted, video.posted, IngestConfig.DATE_MATCH_TOLERANCE_DAYS)
    ));

    let target;
    if (candidates.length === 0) {
      target = {
        id: null,
        key: row.key,
        anchor: row.caption,
        posted: row.posted,
        isNew: true,
        changed: true,
      };
      working.push(target);
    } else {
      // Prefer the candidate whose key overlaps furthest — the most specific match.
      target = candidates.sort((a, b) => b.key.length - a.key.length)[0];
      if (candidates.length > 1) {
        // Genuinely ambiguous. Don't over-engineer matching — surface it and
        // let the bot ask Gana which video she meant.
        ambiguities.push({
          caption: row.caption,
          matched: target.anchor,
          alternatives: candidates.slice(1).map((video) => video.anchor),
        });
      }
      if (row.key.length > target.key.length) { target.key = row.key; target.changed = true; }
      if (row.caption.length > String(target.anchor).length) {
        target.anchor = row.caption;
        target.changed = true;
      }
      const improved = betterDate(target.posted, row.posted);
      if (improved !== target.posted) { target.posted = improved; target.changed = true; }
    }

    assignments.push({ row, video: target });
  }

  return { videos: working, assignments, ambiguities };
}

/** Full pipeline: parse -> resolve identity -> persist videos + observations. */
async function ingestTranscript(text, options = {}) {
  const parsed = parseTranscript(text, options);
  const existing = await db.getVideos();
  const { videos, assignments, ambiguities } = resolveIdentities(parsed.rows, existing);

  const inserts = videos.filter((video) => video.isNew).map((video) => {
    video.id = db.newId();
    return {
      id: video.id,
      caption_key: video.key,
      caption_anchor: video.anchor,
      posted_at: toISODate(video.posted.date),
      posted_at_precision: video.posted.precision,
      first_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      topic_tags: [],
    };
  });

  const updates = videos
    .filter((video) => !video.isNew && video.changed)
    .map((video) => ({
      id: video.id,
      patch: {
        caption_key: video.key,
        caption_anchor: video.anchor,
        posted_at: toISODate(video.posted.date),
        posted_at_precision: video.posted.precision,
      },
    }));

  await db.persistVideos({ inserts, updates });

  const metricRows = assignments.map(({ row, video }) => ({
    video_id: video.id,
    metric: row.metric,
    window_days: row.windowDays,
    value: row.value,
    observed_on: parsed.capturedOn,
  }));
  const written = await db.persistMetrics(metricRows);

  const event = await db.recordIngestEvent({
    captured_on: parsed.capturedOn,
    raw_text: options.storeRaw === false ? null : text,
    row_count: parsed.rows.length,
    video_count: videos.length,
    new_videos: inserts.length,
    ambiguities,
  });

  // Timing is a value the system LEARNS, so her real active-hours data updates
  // the stored send hour rather than a constant in code.
  if (parsed.account.peakHourLocal !== undefined) {
    const state = await db.getBotState();
    if (state.drip_hour_local !== parsed.account.peakHourLocal) {
      await db.updateBotState({ drip_hour_local: parsed.account.peakHourLocal });
      log.info('drip hour updated from her active-hours data', {
        from: state.drip_hour_local,
        to: parsed.account.peakHourLocal,
      });
    }
  }

  const summary = {
    capturedOn: parsed.capturedOn,
    rowCount: parsed.rows.length,
    observationsWritten: written.length,
    videoCount: videos.length,
    newVideos: inserts.length,
    ambiguities,
    account: parsed.account,
    ingestEventId: event && event.id,
  };
  log.info('ingest complete', {
    rows: summary.rowCount, videos: summary.videoCount, new: summary.newVideos,
  });
  return summary;
}

/** Cheap guard so a pasted transcript is recognised without a model call. */
function looksLikeAnalytics(text) {
  const value = String(text || '');
  if (/METRIC:/i.test(value)) return true;
  const pipeRows = value.split(/\r?\n/).filter((line) => (line.match(/\|/g) || []).length >= 1);
  return pipeRows.length >= 5 && /follower|viewer/i.test(value);
}

module.exports = {
  parseTranscript,
  resolveIdentities,
  ingestTranscript,
  looksLikeAnalytics,
  parseAccountContext,
};
