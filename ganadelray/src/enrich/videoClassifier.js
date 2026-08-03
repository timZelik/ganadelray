// src/enrich/videoClassifier.js
//
// Caption -> closed-enum tags. Two layers, on purpose:
//
//   1. A deterministic hashtag/keyword pass. Her captions are hashtag-dense and
//      the topic signal is genuinely explicit ("#apartment #home #moving"), so
//      a model call to read "#moving" would be paying tokens for nothing. It
//      also means enrichment is verifiable offline.
//   2. Sonnet, for the parts a keyword can't see — shooting format and hook
//      mechanism — and for anything the first pass leaves UNCLASSIFIED.
//
// OFF_LANE_VIRAL is applied ONLY when no in-lane topic matched. Her viral
// reach-winners carry #fyp and #relatable, but so do her converters; the
// hashtags alone would misfile half the archive.

const db = require('../db/supabaseClient');
const claude = require('../utils/claudeClient');
const { makeLogger } = require('../utils/logger');
const {
  TopicTag, VideoFormatTag, HookStyle, InLaneTopicTags,
} = require('../utils/constants');
const { normalizeCaption } = require('../utils/text');

const log = makeLogger('classify');

const TOPIC_KEYWORDS = [
  [TopicTag.APARTMENT_HOME_SETUP, ['apartment', '#home', 'home setup', 'hacks', 'organiz', 'adulting', 'my place', 'decor']],
  [TopicTag.MOVING, ['moving', 'movers', 'move in', 'move-in', 'shipping', 'packing', 'first apartment']],
  [TopicTag.BUDGET_FURNITURE, ['furniture', 'affordable', 'coffee table', 'under $', 'pieces', 'budget', 'cheap']],
  [TopicTag.RENTER_FRIENDLY_FIX, ['renter', 'security deposit', 'damage', 'mount', 'drill', 'landlord', 'diy']],
  [TopicTag.FITNESS_WORKOUTS, ['workout', 'weights', 'bands', 'gym', 'machine', 'abs', 'fitness', 'exercise', 'reps']],
  [TopicTag.CREDIT_CARDS, ['credit', 'creditcard', 'bilt', 'points', 'cashback', 'amex']],
  [TopicTag.TECH_AMAZON_FINDS, ['amazon', 'tech ', '#tech', 'storefront', 'gadget', 'smartring', 'ringconn', 'my favorite tech']],
  [TopicTag.FOOD, ['panda', 'chicken', 'chow mein', 'food', 'recipe', 'restaurant', 'eats', 'takeout']],
  [TopicTag.LIFESTYLE_DATING, ['shera', 'dating', 'datingadvice', 'relationship', 'lessons', 'advice']],
];

const OFF_LANE_KEYWORDS = [
  'cleantok', 'cleaning', 'funny', 'viral', 'relatable', 'relateable', 'movie',
  'movies', 'filmtok', 'warfare', 'music', 'songs', 'oliviarodrigo', 'caldiet',
  'diet', 'free trial', 'ysl', 'beach',
];

const FORMAT_HINTS = [
  [VideoFormatTag.TUTORIAL_HOWTO, ['how to', 'step by step', 'tutorial', 'you should rly do', 'things to do before']],
  [VideoFormatTag.LISTICLE, [/^\d+\s+\w+/, 'items are in the link', 'my favorite', 'things you']],
  [VideoFormatTag.PRODUCT_DEMO, ['free trial', 'link in bio', 'storefront', 'demos of each', 'ad', 'sponsor']],
  [VideoFormatTag.VOICEOVER_BROLL, ['all the costs', 'what i ordered vs', 'haul']],
  [VideoFormatTag.STORYTIME, ['i did it', 'i was onto something', 'story']],
];

const HOOK_HINTS = [
  [HookStyle.NUMBER_STAT, [/^\d+\s/]],
  [HookStyle.QUESTION, ['?', 'is it just me', 'why does']],
  [HookStyle.RELATABLE_CALLOUT, ['pov', 'bc why', 'lowkey', 'me when']],
  [HookStyle.CONTRARIAN, ['nobody tells you', 'not necessary', 'rly do']],
  [HookStyle.CURIOSITY_GAP, ['i was onto something', 'the one thing', 'what i ordered vs']],
  [HookStyle.DIRECT_ADDRESS, ['lmk', 'follow for', 'link below', 'in my bio']],
];

function matches(haystack, needle) {
  return needle instanceof RegExp ? needle.test(haystack) : haystack.includes(needle);
}

function detectSeries(caption) {
  const text = normalizeCaption(caption);
  const numbered = text.match(/\bpart\s*(\d+)\b/);
  const teased = /follow for (a |the )?(part|next)/.test(text) || /next parts?/.test(text);
  if (!numbered && !teased) return { isSeries: false, seriesPart: null };
  return {
    isSeries: true,
    seriesPart: numbered ? Number(numbered[1]) : null,
  };
}

/** Deterministic pass. No model, no network. */
function classifyHeuristic(caption) {
  const text = normalizeCaption(caption);

  const topicTags = TOPIC_KEYWORDS
    .filter(([, needles]) => needles.some((needle) => matches(text, needle)))
    .map(([tag]) => tag);

  if (topicTags.length === 0) {
    topicTags.push(
      OFF_LANE_KEYWORDS.some((needle) => text.includes(needle))
        ? TopicTag.OFF_LANE_VIRAL
        : TopicTag.UNCLASSIFIED,
    );
  }

  const format = FORMAT_HINTS.find(([, needles]) => needles.some((needle) => matches(text, needle)));
  const hook = HOOK_HINTS.find(([, needles]) => needles.some((needle) => matches(text, needle)));

  return {
    topicTags,
    formatTag: format ? format[0] : VideoFormatTag.VOICEOVER_BROLL,
    hookStyle: hook ? hook[0] : HookStyle.DIRECT_ADDRESS,
    ...detectSeries(caption),
    source: 'heuristic',
  };
}

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    videos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          topic_tags: {
            type: 'array',
            items: { type: 'string', enum: Object.values(TopicTag) },
            minItems: 1,
          },
          format_tag: { type: 'string', enum: Object.values(VideoFormatTag) },
          hook_style: { type: 'string', enum: Object.values(HookStyle) },
          is_series: { type: 'boolean' },
          series_part: { type: ['integer', 'null'] },
          series_name: { type: ['string', 'null'] },
        },
        required: ['id', 'topic_tags', 'format_tag', 'hook_style', 'is_series', 'series_part', 'series_name'],
        additionalProperties: false,
      },
    },
  },
  required: ['videos'],
  additionalProperties: false,
};

const CLASSIFY_SYSTEM = `You tag TikTok videos for @ganadelray, a creator whose audience is 81% female.

You are given truncated captions (they end mid-sentence — that is expected).
Assign closed-enum tags only. Rules:

- topic_tags: 1-3 tags. Use OFF_LANE_VIRAL only when NO in-lane topic applies —
  her viral reach content (cleaning humour, music, movies, relatable skits,
  diet-app ads) carries the same #fyp/#relatable hashtags her converting content
  does, so judge by SUBJECT, not hashtags.
  In-lane topics: ${InLaneTopicTags.join(', ')}.
- format_tag: how the video is SHOT (structure), not what it is about.
- hook_style: the mechanism of the first three seconds.
- is_series / series_part: true when the caption says "part N", "follow for a
  part N", or "next parts". series_name is a short label for the series.

Return one entry per input video, using the exact id given.`;

/** Model pass. Refines format/hook and resolves anything the keywords missed. */
async function classifyWithModel(videos) {
  const payload = videos.map((video) => ({
    id: video.id,
    caption: video.caption_anchor || video.caption,
    posted_at: video.posted_at || video.postedAt || null,
  }));

  const result = await claude.completeJson({
    role: 'SKILL_EXECUTION',
    system: CLASSIFY_SYSTEM,
    user: `Tag these ${payload.length} videos:\n\n${JSON.stringify(payload, null, 2)}`,
    schema: CLASSIFY_SCHEMA,
    maxTokens: 6000,
  });

  const byId = new Map(result.videos.map((entry) => [entry.id, entry]));
  return videos.map((video) => {
    const tagged = byId.get(video.id);
    if (!tagged) return { id: video.id, ...classifyHeuristic(video.caption_anchor || video.caption) };
    return {
      id: video.id,
      topicTags: tagged.topic_tags,
      formatTag: tagged.format_tag,
      hookStyle: tagged.hook_style,
      isSeries: tagged.is_series,
      seriesPart: tagged.series_part,
      seriesName: tagged.series_name,
      source: 'model',
    };
  });
}

/**
 * Tag every unclassified video in the archive. Falls back to the heuristic pass
 * when no API key is configured or the model call fails — every row ends up
 * tagged either way, because an untagged row is invisible to idea generation.
 */
async function enrichArchive({ force = false, useModel = claude.isConfigured(), batchSize = 25 } = {}) {
  const videos = await db.getVideos();
  const pending = force ? videos : videos.filter((video) => !video.classified_at);
  if (pending.length === 0) {
    log.info('nothing to classify');
    return { classified: 0, source: 'none' };
  }

  let results = [];
  let source = 'heuristic';
  if (useModel) {
    try {
      for (let i = 0; i < pending.length; i += batchSize) {
        results.push(...await classifyWithModel(pending.slice(i, i + batchSize)));
      }
      source = 'model';
    } catch (error) {
      log.warn('model classification failed, falling back to heuristics', { message: error.message });
      results = [];
    }
  }
  if (results.length === 0) {
    results = pending.map((video) => ({ id: video.id, ...classifyHeuristic(video.caption_anchor) }));
  }

  const updates = results.map((entry) => ({
    id: entry.id,
    patch: {
      topic_tags: entry.topicTags,
      format_tag: entry.formatTag,
      hook_style: entry.hookStyle,
      is_series: entry.isSeries,
      series_part: entry.seriesPart,
      series_name: entry.seriesName || null,
      classified_at: new Date().toISOString(),
    },
  }));
  await db.persistVideos({ inserts: [], updates });

  log.info('classified', { count: updates.length, source });
  return { classified: updates.length, source, results };
}

module.exports = { classifyHeuristic, classifyWithModel, enrichArchive, detectSeries };
