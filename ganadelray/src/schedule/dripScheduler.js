// src/schedule/dripScheduler.js
//
// WHEN the bot talks, and whether it is allowed to at all.
//
// Scheduling is external (GitHub Actions cron -> this app's /internal/drip
// endpoint), NOT Vercel Hobby cron: that is once-daily minimum and +/-59min
// imprecise, which cannot hit an audience peak.
//
// Timing is read from bot_state, never from a constant, because the send hour is
// a value the system will LEARN. drip_sent_at and gana_responded_at are written
// on every send from day one so that learner has data when it is built. The
// learner itself is deliberately NOT built yet — there is no behaviour to learn
// from until she has been using this for weeks.

const db = require('../db/supabaseClient');
const archiveLib = require('../archive/converterArchive');
const telegram = require('./../telegram/telegramClient');
const copy = require('../telegram/copy');
const { generateIdeas, persistIdeas } = require('../ideas/ideaGenerator');
const { maybeSurfacePattern } = require('../ideas/patternSurfacer');
const { pickRedrip } = require('../ideas/ideaBank');
const { makeLogger } = require('../utils/logger');
const { NudgeGuardRails, DripTimingDefaults, IdeaOrigin, IdeaStatus } = require('../utils/constants');
const { localHour, localDateKey, daysBetween } = require('../utils/dates');

const log = makeLogger('drip');

const SLOW_MORNING_QUIET_DAYS = 3;

async function dripState() {
  const state = await db.getBotState();
  return {
    ...state,
    timezone: state.timezone || DripTimingDefaults.TIMEZONE,
    drip_hour_local: state.drip_hour_local ?? DripTimingDefaults.HOUR_LOCAL,
  };
}

/**
 * Every guard rail in one place: paused, one-per-day, auto-stop after silence.
 * Silence is DATA, not failure — after three unanswered drips the bot stops
 * pushing and stays available on demand. It never nags.
 */
async function canDripToday({ now = new Date() } = {}) {
  const state = await dripState();
  const dripDate = localDateKey(state.timezone, now);

  if (state.paused) return { allowed: false, reason: 'paused', dripDate, state };

  if (state.unanswered_nudges >= NudgeGuardRails.STOP_AFTER_UNANSWERED_NUDGES) {
    return { allowed: false, reason: 'auto-stopped after unanswered drips', dripDate, state };
  }

  const existing = await db.getDripForDate(dripDate);
  if (existing) return { allowed: false, reason: 'already dripped today', dripDate, state };

  return { allowed: true, reason: 'ok', dripDate, state };
}

/** The hourly cron only fires the drip inside her audience-peak hour. */
function isDripHour(state, now = new Date()) {
  return localHour(state.timezone, now) === state.drip_hour_local;
}

async function dataAgeDays(now = new Date()) {
  const event = await db.getLatestIngestEvent();
  if (!event) return null;
  return daysBetween(now, new Date(`${event.captured_on}T00:00:00Z`));
}

/**
 * The daily send. `force` bypasses the hour check (used by the manual trigger
 * and the self-check); it does NOT bypass pause, one-per-day, or auto-stop.
 */
async function runDailyDrip({ force = false, now = new Date() } = {}) {
  const gate = await canDripToday({ now });
  if (!gate.allowed) {
    log.info('drip suppressed', { reason: gate.reason });
    return { sent: false, reason: gate.reason };
  }
  if (!force && !isDripHour(gate.state, now)) {
    return { sent: false, reason: 'outside drip hour' };
  }

  const patternLine = await maybeSurfacePattern(gate.state);
  const ideas = await generateIdeas({ count: undefined, patternNote: patternLine });
  if (ideas.length === 0) return { sent: false, reason: 'no ideas survived validation' };

  const drip = await db.recordDrip({ dripDate: gate.dripDate, ideaIds: [], kind: 'DRIP' });
  const stored = await persistIdeas(ideas, { origin: IdeaOrigin.DRIP, status: IdeaStatus.SENT, dripId: drip.id });
  await db.attachIdeasToDrip(drip.id, stored.map((idea) => idea.id));

  const staleDays = await dataAgeDays(now);
  const message = copy.formatDripMessage(stored, { patternLine, staleDays });
  await telegram.sendChunked(message);

  // A slow morning — she has not said anything in days — is exactly when a
  // banked idea of her own is worth handing back.
  const quietDays = gate.state.last_inbound_at
    ? daysBetween(now, new Date(gate.state.last_inbound_at))
    : null;
  if (quietDays !== null && quietDays >= SLOW_MORNING_QUIET_DAYS) {
    const redrip = await pickRedrip();
    if (redrip) await telegram.sendChunked(copy.formatRedrip(redrip.banked));
  }

  await db.updateBotState({
    unanswered_nudges: (gate.state.unanswered_nudges || 0) + 1,
    drips_since_pattern: patternLine ? 0 : (gate.state.drips_since_pattern || 0) + 1,
  });

  log.info('drip sent', { ideas: stored.length, dripDate: gate.dripDate, pattern: Boolean(patternLine) });
  return { sent: true, ideas: stored, dripId: drip.id, patternLine };
}

/**
 * On-demand ideas. Not a drip: no daily cap, no unanswered counter, because she
 * asked. Still logged so dedupe keeps working across both paths.
 */
async function runOnDemandIdeas({ focusTopic = null, count } = {}) {
  const ideas = await generateIdeas({ count, focusTopic });
  const stored = await persistIdeas(ideas, { origin: IdeaOrigin.ON_DEMAND, status: IdeaStatus.SENT });
  return stored;
}

/**
 * She said something. Stamps gana_responded_at against the open drip (the raw
 * material for the timing learner) and clears the unanswered counter.
 */
async function registerInbound({ now = new Date() } = {}) {
  await db.markGanaResponded(now);
  await db.updateBotState({ unanswered_nudges: 0, last_inbound_at: now.toISOString() });
}

/** Weekly performance statement — followers first, always. */
async function performanceSummary({ windowDays = 365 } = {}) {
  const archive = await archiveLib.loadArchive();
  const ranked = archiveLib.rankConverters(archive, { windowDays, limit: 5 });
  return copy.formatPerformanceReview(ranked, { windowDays });
}

module.exports = {
  canDripToday,
  isDripHour,
  runDailyDrip,
  runOnDemandIdeas,
  registerInbound,
  performanceSummary,
  dataAgeDays,
};
