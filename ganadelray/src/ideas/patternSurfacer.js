// src/ideas/patternSurfacer.js
//
// Occasionally — NOT daily, that's noise — surface one genuinely non-obvious
// observation as a statement. This is the one thing she literally cannot do for
// herself: she is inside the content and cannot see the pattern.
//
// The signals are computed deterministically here and handed to the model as
// numbers. The model only phrases the one it judges non-obvious, or declines.
// A confidently wrong pattern is worse than no pattern at all.

const archiveLib = require('../archive/converterArchive');
const claude = require('../utils/claudeClient');
const prompts = require('./prompts');
const { makeLogger } = require('../utils/logger');
const {
  NudgeGuardRails, MetricKind, RankingConfig, AnalyticsWindowDays,
} = require('../utils/constants');
const { tokens } = require('../utils/text');

const log = makeLogger('pattern');

const MIN_VIDEOS_FOR_PATTERNS = 10;

/**
 * Group parts of the same series. The part marker has to come off first: part 1
 * is captioned "4 apartment hacks..." while part 2 is "part 2 of 4 apartment
 * hacks...", so keying on the raw opening words would never group them.
 */
function seriesKey(video) {
  const stripped = String(video.caption)
    .replace(/^\s*part\s*\d+\s*(of|:)?\s*/i, '')
    .replace(/\(\s*part\s*\d+\s*\)/i, ' ');
  return tokens(stripped).slice(0, 3).join(' ');
}

/**
 * part-N vs part-1 of the same series.
 *
 * Parts are only ever compared on a window where BOTH have a reading. A part-1's
 * 365-day count against a part-2's 7-day count would manufacture a pattern out
 * of nothing — and a confidently wrong pattern is worse than no pattern.
 */
function seriesSignals(archive) {
  // Group across the WHOLE archive, not just videos flagged as series: part 1 is
  // captioned "4 apartment hacks..." with no part marker at all, so filtering to
  // flagged videos first would leave every series holding only its later parts.
  const groups = new Map();
  for (const video of archive) {
    const key = seriesKey(video);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(video);
  }

  const rows = [];
  for (const [key, videos] of groups) {
    if (videos.length < 2) continue;
    if (!videos.some((video) => video.isSeries)) continue;
    const sorted = videos.slice().sort((a, b) => (a.seriesPart || 0) - (b.seriesPart || 0));
    const sharedWindow = AnalyticsWindowDays
      .slice()
      .sort((a, b) => b - a)
      .find((days) => sorted.every((video) => video.followers[days] !== null));
    if (!sharedWindow) continue;
    rows.push({
      series: key,
      compared_on_window_days: sharedWindow,
      parts: sorted.map((video) => ({
        part: video.seriesPart,
        part_label: video.seriesPart ? `part ${video.seriesPart}` : 'original (no part marker in caption)',
        followers: video.followers[sharedWindow],
        caption: String(video.caption).slice(0, 40),
      })),
    });
  }
  return rows;
}

/** Topic averages — which lane actually converts, in numbers. */
function topicSignals(ranked) {
  const byTopic = new Map();
  for (const video of ranked) {
    for (const tag of video.topicTags) {
      if (!byTopic.has(tag)) byTopic.set(tag, []);
      byTopic.get(tag).push(video);
    }
  }
  return [...byTopic.entries()].map(([topic, videos]) => ({
    topic,
    videos: videos.length,
    median_followers: videos
      .map((video) => video.newFollowers)
      .sort((a, b) => a - b)[Math.floor(videos.length / 2)],
    best_followers_per_1k: Math.max(...videos.map((video) => video.followersPer1K || 0)).toFixed(1),
  })).sort((a, b) => b.median_followers - a.median_followers);
}

/** Month-of-post signal — thin data, so it is offered, never asserted. */
function seasonalSignals(ranked) {
  const byMonth = new Map();
  for (const video of ranked) {
    if (!video.postedAt) continue;
    const month = video.postedAt.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(video.newFollowers);
  }
  return [...byMonth.entries()]
    .map(([month, values]) => ({
      month,
      videos: values.length,
      total_followers: values.reduce((sum, value) => sum + value, 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Low reach, high conversion — the videos her instinct undervalues. */
function sleeperSignals(ranked) {
  return ranked
    .filter((video) => video.views && video.followersPer1K && video.views < 100_000)
    .sort((a, b) => b.followersPer1K - a.followersPer1K)
    .slice(0, 5)
    .map((video) => ({
      caption: String(video.caption).slice(0, 40),
      followers: video.newFollowers,
      views: video.views,
      followers_per_1k: video.followersPer1K.toFixed(1),
    }));
}

async function computeSignals() {
  const archive = await archiveLib.loadArchive();
  const ranked = archiveLib.rankConverters(archive, {
    windowDays: RankingConfig.PRIMARY_WINDOW_DAYS,
    limit: 100,
  });
  return {
    videoCount: ranked.length,
    metric: MetricKind.NEW_FOLLOWERS,
    note: 'Every number here is NEW FOLLOWERS. Series parts are compared only on a window where both parts have a reading.',
    series: seriesSignals(archive),
    topics: topicSignals(ranked),
    seasonal: seasonalSignals(ranked),
    sleepers: sleeperSignals(ranked),
  };
}

/** Returns a one-line observation, or null. Null is the common, correct answer. */
async function surfacePattern() {
  const signals = await computeSignals();
  if (signals.videoCount < MIN_VIDEOS_FOR_PATTERNS) return null;
  if (!claude.isConfigured()) return null;

  try {
    const result = await claude.completeJson({
      role: 'DEEP_SYNTHESIS',
      system: prompts.PATTERN_SYSTEM,
      user: `Signals computed from her archive (all counts are NEW FOLLOWERS):\n\n${JSON.stringify(signals, null, 2)}`,
      schema: prompts.PATTERN_SCHEMA,
      maxTokens: 3000,
    });
    if (!result.has_pattern || !result.observation) return null;
    log.info('pattern surfaced', { evidence: result.evidence });
    return result.observation;
  } catch (error) {
    log.warn('pattern surfacing failed', { message: error.message });
    return null;
  }
}

/** Rate-limited entry point used by the drip. */
async function maybeSurfacePattern(state) {
  const due = (state.drips_since_pattern || 0) >= NudgeGuardRails.PATTERN_SURFACE_EVERY_N_DRIPS;
  if (!due) return null;
  return surfacePattern();
}

module.exports = { computeSignals, surfacePattern, maybeSurfacePattern };
