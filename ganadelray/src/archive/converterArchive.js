// src/archive/converterArchive.js
//
// The backbone. Turns raw observations into a ranked converter table.
//
// THE RULE: rank on NEW FOLLOWERS, always. Reach and follower-conversion are
// decoupled for this account — the 4.9M-view diet ad produced 542 followers
// while a 49K-view resistance-bands workout produced 717. Ranking on views
// would point the whole system at the content that grows the account least.
// Views are kept only to compute the conversion gap, which is the *explainer*.

const db = require('../db/supabaseClient');
const { RankingConfig, MetricKind, AnalyticsWindowDays } = require('../utils/constants');
const { similarity } = require('../utils/text');
const { daysBetween } = require('../utils/dates');

/** Latest observation per (metric, window) for each video. */
function indexMetrics(metrics) {
  const byVideo = new Map();
  for (const row of metrics) {
    if (!byVideo.has(row.video_id)) byVideo.set(row.video_id, new Map());
    const key = `${row.metric}:${row.window_days}`;
    const bucket = byVideo.get(row.video_id);
    const current = bucket.get(key);
    if (!current || String(row.observed_on) >= String(current.observed_on)) {
      bucket.set(key, row);
    }
  }
  return byVideo;
}

function readMetric(bucket, metric, windowDays) {
  const row = bucket && bucket.get(`${metric}:${windowDays}`);
  return row ? row.value : null;
}

/**
 * Views are only ever a denominator here, and the per-window views for a given
 * video are often missing (TikTok shows top-10 per tab). Fall back to the
 * nearest window we do have and say so, rather than silently reporting 0.
 */
function readMetricWithFallback(bucket, metric, windowDays) {
  const exact = readMetric(bucket, metric, windowDays);
  if (exact !== null) return { value: exact, windowDays, exact: true };
  const candidates = AnalyticsWindowDays
    .filter((days) => readMetric(bucket, metric, days) !== null)
    .sort((a, b) => Math.abs(a - windowDays) - Math.abs(b - windowDays));
  if (candidates.length === 0) return { value: null, windowDays: null, exact: false };
  const chosen = candidates[0];
  return { value: readMetric(bucket, metric, chosen), windowDays: chosen, exact: false };
}

function ageDays(video, now = new Date()) {
  if (!video.posted_at) return null;
  return daysBetween(now, new Date(`${video.posted_at}T00:00:00Z`));
}

/** Loads videos + observations and flattens them into one usable shape. */
async function loadArchive({ now = new Date() } = {}) {
  const [videos, metrics] = await Promise.all([db.getVideos(), db.getMetrics()]);
  const index = indexMetrics(metrics);

  return videos.map((video) => {
    const bucket = index.get(video.id);
    const followers = {};
    const viewers = {};
    for (const days of AnalyticsWindowDays) {
      followers[days] = readMetric(bucket, MetricKind.NEW_FOLLOWERS, days);
      viewers[days] = readMetric(bucket, MetricKind.NEW_VIEWERS, days);
    }
    return {
      id: video.id,
      caption: video.caption_anchor,
      captionKey: video.caption_key,
      postedAt: video.posted_at,
      postedPrecision: video.posted_at_precision,
      topicTags: video.topic_tags || [],
      formatTag: video.format_tag || null,
      hookStyle: video.hook_style || null,
      isSeries: Boolean(video.is_series),
      seriesPart: video.series_part || null,
      seriesName: video.series_name || null,
      classifiedAt: video.classified_at || null,
      followers,
      viewers,
      ageDays: ageDays(video, now),
      _bucket: bucket,
    };
  });
}

/**
 * The ranked converter table. Sorted by follower VOLUME (not rate) — rate alone
 * rewards low-view flukes, and she needs ideas modelled on things that actually
 * moved real numbers of people to follow.
 */
function rankConverters(archive, {
  windowDays = RankingConfig.PRIMARY_WINDOW_DAYS,
  limit = 20,
  // Retrieval (analogues, idea sourcing) needs every video we have ANY follower
  // reading for; the headline table stays strict so its numbers are comparable.
  fallbackWindow = false,
} = {}) {
  return archive
    .map((video) => {
      const followerReading = fallbackWindow
        ? readMetricWithFallback(video._bucket, MetricKind.NEW_FOLLOWERS, windowDays)
        : { value: video.followers[windowDays], windowDays, exact: true };
      const followers = followerReading.value;
      const views = readMetricWithFallback(video._bucket, MetricKind.NEW_VIEWERS, followerReading.windowDays || windowDays);
      const followersPer1K = (followers && views.value)
        ? (followers / views.value) * 1000
        : null;
      return {
        ...video,
        windowDays: followerReading.windowDays || windowDays,
        newFollowers: followers,
        followersApproximate: !followerReading.exact,
        views: views.value,
        viewsWindowDays: views.windowDays,
        viewsApproximate: !views.exact,
        followersPer1K,
      };
    })
    .filter((video) => video.newFollowers !== null && video.newFollowers > 0)
    .sort((a, b) => b.newFollowers - a.newFollowers)
    .slice(0, limit);
}

/**
 * Idea fuel: weight recent × high-follower so the drip stays current without
 * throwing away a proven 365-day winner.
 */
function sourcePool(archive, { limit = RankingConfig.SOURCE_POOL_SIZE } = {}) {
  const ranked = rankConverters(archive, { limit: 200 });
  const halfLife = RankingConfig.RECENCY_HALF_LIFE_DAYS;
  return ranked
    .map((video) => {
      const age = video.ageDays === null ? halfLife * 2 : Math.max(video.ageDays, 0);
      const recencyWeight = Math.pow(0.5, age / halfLife);
      return { ...video, recencyWeight, score: video.newFollowers * (0.35 + 0.65 * recencyWeight) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Inverse mode: given an idea in her words, find her closest real converters.
 * Never predicts virality. An empty result means "unproven", not "no".
 */
function findAnalogues(archive, { text = '', topicTags = [], formatTag = null, limit = RankingConfig.ANALOGUE_RESULT_LIMIT } = {}) {
  // Match across everything we have any follower reading for. "No 365-day data"
  // is not the same as "didn't convert", and telling her she's never made
  // anything similar when she has would be the worst possible answer here.
  const ranked = rankConverters(archive, { limit: 200, fallbackWindow: true });

  // Videos we have no follower reading for at all still count as "she has made
  // something like this" — they just carry no conversion evidence, and the copy
  // says so rather than pretending they don't exist.
  const rankedIds = new Set(ranked.map((video) => video.id));
  const undated = archive
    .filter((video) => !rankedIds.has(video.id))
    .map((video) => ({ ...video, newFollowers: null, views: null, followersPer1K: null }));

  return [...ranked, ...undated]
    .map((video) => {
      const textScore = similarity(text, video.caption);
      const topicScore = topicTags.some((tag) => video.topicTags.includes(tag)) ? 1 : 0;
      const formatScore = formatTag && video.formatTag === formatTag ? 1 : 0;
      const match = (0.5 * textScore) + (0.35 * topicScore) + (0.15 * formatScore);
      return { ...video, matchScore: match, matchTextScore: textScore };
    })
    .filter((video) => video.matchScore > 0.08)
    .sort((a, b) => (b.matchScore - a.matchScore) || ((b.newFollowers || 0) - (a.newFollowers || 0)))
    .slice(0, limit);
}

/**
 * "Converts N× better than X" — the sentence that makes a 49K-view video read
 * as a win instead of a flop.
 */
function conversionGap(video, archive, { windowDays = RankingConfig.PRIMARY_WINDOW_DAYS } = {}) {
  if (!video.followersPer1K) return null;
  const ranked = rankConverters(archive, { windowDays, limit: 200 });
  const reachWinner = ranked
    .filter((other) => other.id !== video.id && other.views && other.followersPer1K)
    .sort((a, b) => b.views - a.views)[0];
  if (!reachWinner || !reachWinner.followersPer1K) return null;
  return {
    multiple: video.followersPer1K / reachWinner.followersPer1K,
    against: reachWinner,
  };
}

/** Human-readable rows for the step-3 log Tim eyeballs. */
function formatRankTable(ranked) {
  return ranked.map((video, index) => ({
    '#': index + 1,
    followers: video.newFollowers,
    views: video.views === null ? '—' : video.views,
    'per 1K': video.followersPer1K === null ? '—' : video.followersPer1K.toFixed(1),
    posted: video.postedAt || '—',
    topics: video.topicTags.join(',') || '—',
    caption: String(video.caption).slice(0, 52),
  }));
}

module.exports = {
  loadArchive,
  rankConverters,
  sourcePool,
  findAnalogues,
  conversionGap,
  formatRankTable,
  readMetricWithFallback,
};
