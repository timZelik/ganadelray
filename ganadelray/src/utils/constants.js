// src/utils/constants.js
//
// Single source of truth for every magic value in the system.
// No string literals for models, intents, or tags live anywhere else.
// Closed enums on purpose: free-text tags drift within weeks and silently
// rot retrieval quality. Extend these lists deliberately, never inline.

// ---------------------------------------------------------------------------
// Model routing — tiered by cost. Cheapest model that clears the bar wins.
// ---------------------------------------------------------------------------
const AnthropicModelForRole = Object.freeze({
  INTENT_CLASSIFICATION: 'claude-haiku-4-5', // <200 token prompt, structured
  SKILL_EXECUTION:       'claude-sonnet-5',  // idea generation, tagging, hooks
  DEEP_SYNTHESIS:        'claude-opus-5',    // pattern surfacing — rare
});

// Effort is only accepted by the Sonnet/Opus tier; Haiku 4.5 rejects it.
const EffortForRole = Object.freeze({
  SKILL_EXECUTION: 'medium',
  DEEP_SYNTHESIS:  'high',
});

// ---------------------------------------------------------------------------
// Intent classes — the things Gana can be trying to do in one message.
// Haiku maps her text to exactly one of these; skillRouter maps each to a handler.
// ---------------------------------------------------------------------------
const ConversationIntent = Object.freeze({
  INGEST_ANALYTICS:   'INGEST_ANALYTICS',    // she pasted a transcribed analytics dump
  CHECK_IDEA:         'CHECK_IDEA',          // "will this do well?" -> analogue retrieval
  BANK_IDEA:          'BANK_IDEA',           // voice note: an idea to hold for later
  REQUEST_IDEAS:      'REQUEST_IDEAS',       // "give me ideas" / "what should I make"
  REQUEST_REMIX:      'REQUEST_REMIX',       // "give me variations of X"
  REQUEST_SERIES:     'REQUEST_SERIES',      // "turn that into a series"
  REQUEST_HOOKS:      'REQUEST_HOOKS',       // "write me the hook / on-screen text"
  REVIEW_PERFORMANCE: 'REVIEW_PERFORMANCE',  // "how did last week go?"
  REJECT_IDEA:        'REJECT_IDEA',         // "nah, not that one" -> taste signal
  ACCEPT_IDEA:        'ACCEPT_IDEA',         // "shooting this today"
  PAUSE_NUDGES:       'PAUSE_NUDGES',        // "pause" / "stop messaging me"
  RESUME_NUDGES:      'RESUME_NUDGES',
  SMALL_TALK:         'SMALL_TALK',          // everything else — reply briefly, don't force a skill
});

// ---------------------------------------------------------------------------
// TAG TAXONOMY — the spine of retrieval. Three closed vocabularies.
// ---------------------------------------------------------------------------

// HOW the video is shot / structured.
const VideoFormatTag = Object.freeze({
  TALKING_HEAD:   'TALKING_HEAD',   // speaking direct to camera
  POV:            'POV',            // "pov: you..." framed scenario
  GET_READY_WITH_ME: 'GET_READY_WITH_ME',
  GREENSCREEN:    'GREENSCREEN',    // reacting over a background image/video
  VOICEOVER_BROLL:'VOICEOVER_BROLL',// narration over b-roll footage
  DAY_IN_THE_LIFE:'DAY_IN_THE_LIFE',// vlog-style montage
  TUTORIAL_HOWTO: 'TUTORIAL_HOWTO', // step-by-step instructional
  PRODUCT_DEMO:   'PRODUCT_DEMO',   // UGC / branded deal showing a product
  STORYTIME:      'STORYTIME',      // narrative recounting an event
  TREND_AUDIO:    'TREND_AUDIO',    // dance / lip-sync / trending-sound format
  LISTICLE:       'LISTICLE',       // "3 things that..." enumerated payload
});

// The mechanism of the FIRST 3 SECONDS — what makes the thumb stop.
const HookStyle = Object.freeze({
  QUESTION:          'QUESTION',          // opens by asking the viewer something
  BOLD_CLAIM:        'BOLD_CLAIM',        // asserts something strong up front
  CONTRARIAN:        'CONTRARIAN',        // "nobody tells you..." / against-the-grain
  CURIOSITY_GAP:     'CURIOSITY_GAP',     // "the one thing..." withholds the payoff
  RELATABLE_CALLOUT: 'RELATABLE_CALLOUT', // "pov: you finally..." names the viewer's moment
  BEFORE_AFTER:      'BEFORE_AFTER',      // transformation tease
  NUMBER_STAT:       'NUMBER_STAT',       // leads with a figure
  DIRECT_ADDRESS:    'DIRECT_ADDRESS',    // "if you're a ___, watch this"
  VISUAL_SHOCK:      'VISUAL_SHOCK',      // arresting first frame, no words needed
});

// WHAT the video is about. Populated from her real 365-day export, not guesses.
// OFF_LANE_VIRAL is deliberate: her reach-winners (cleaning humor, music, movies,
// relatable skits) must be *nameable* so the idea generator can exclude them.
// They inflate views and convert almost nobody.
const TopicTag = Object.freeze({
  APARTMENT_HOME_SETUP: 'APARTMENT_HOME_SETUP', // apartment hacks, setup, organization
  MOVING:               'MOVING',               // moving costs, prep, logistics
  BUDGET_FURNITURE:     'BUDGET_FURNITURE',     // affordable furniture hauls, storefront
  RENTER_FRIENDLY_FIX:  'RENTER_FRIENDLY_FIX',  // TV mounting, damage-free, deposit-saving
  FITNESS_WORKOUTS:     'FITNESS_WORKOUTS',     // workouts, gym machines, bands/weights
  CREDIT_CARDS:         'CREDIT_CARDS',         // Bilt, card comparisons, points
  TECH_AMAZON_FINDS:    'TECH_AMAZON_FINDS',    // tech picks, Amazon storefront finds
  FOOD:                 'FOOD',                 // food, takeout, cooking
  LIFESTYLE_DATING:     'LIFESTYLE_DATING',     // Shera Seven, dating advice, lifestyle
  OFF_LANE_VIRAL:       'OFF_LANE_VIRAL',       // cleaning humor, music, movies, skits, ads
  UNCLASSIFIED:         'UNCLASSIFIED',
});

// Her proven follower-converting lane. Ideas MUST land in here.
// Everything else is reach, not growth — see the decoupling insight in CLAUDE.md.
const InLaneTopicTags = Object.freeze([
  TopicTag.APARTMENT_HOME_SETUP,
  TopicTag.MOVING,
  TopicTag.BUDGET_FURNITURE,
  TopicTag.RENTER_FRIENDLY_FIX,
  TopicTag.FITNESS_WORKOUTS,
  TopicTag.CREDIT_CARDS,
  TopicTag.TECH_AMAZON_FINDS,
  TopicTag.FOOD,
  TopicTag.LIFESTYLE_DATING,
]);

// ---------------------------------------------------------------------------
// Analytics ingestion — pasted TEXT, not CSV, not screenshots.
// Tim runs the screenshots through Gemini; we parse the clean text.
// ---------------------------------------------------------------------------
const MetricKind = Object.freeze({
  NEW_FOLLOWERS: 'new_followers', // conversion — THE north-star
  NEW_VIEWERS:   'new_viewers',   // reach — secondary, only for the conversion-gap calc
});

// Per-window counts for one video are separate observations, never overwrites.
const AnalyticsWindowDays = Object.freeze([7, 28, 60, 365]);

// How precisely we know a video's posted date.
const DatePrecision = Object.freeze({
  EXACT:       'EXACT',       // "Posted on Jun 3, 2025"
  MONTH_DAY:   'MONTH_DAY',   // "Posted on Jun 9" — year inferred from ingest date
  APPROXIMATE: 'APPROXIMATE', // "2w ago" — resolved against ingest date
  UNKNOWN:     'UNKNOWN',
});

const IngestConfig = Object.freeze({
  // Identity anchor: normalized caption prefix, capped so a longer re-scrape of
  // the same video still collides with the shorter earlier one.
  CAPTION_KEY_LENGTH: 48,
  // Relative dates ("1mo ago") are coarse. Two rows whose captions prefix-match
  // are the same video if their resolved dates land within this many days.
  DATE_MATCH_TOLERANCE_DAYS: 21,
  // Below this, a caption prefix is too generic to anchor identity on.
  MIN_CAPTION_KEY_LENGTH: 12,
});

// ---------------------------------------------------------------------------
// Ranking & freshness — the business rules the plan settled on.
// ---------------------------------------------------------------------------
const RankingConfig = Object.freeze({
  PRIMARY_SORT_FIELD: 'new_followers', // volume, NOT rate — rate rewards low-view flukes
  PRIMARY_WINDOW_DAYS: 365,            // the window that proves what actually converts
  ANALOGUE_RESULT_LIMIT: 5,
  // Idea sourcing weights recent × high-follower. A 365d winner still counts,
  // but a converter from the last 60 days counts for more.
  RECENCY_HALF_LIFE_DAYS: 120,
  SOURCE_POOL_SIZE: 12, // how many converters feed one generation call
});

const DataFreshness = Object.freeze({
  STALE_AFTER_DAYS: 8,    // beyond this, every ranking response prefixes with data age
  INGEST_WINDOW_DAYS: 28, // re-score a rolling 28-day window each weekly ingest
});

// ---------------------------------------------------------------------------
// Idea generation — the primary feature.
// ---------------------------------------------------------------------------
const IdeaConfig = Object.freeze({
  IDEAS_PER_DRIP: 3,
  // ~1 in 5 ideas is an explicit BET: an untested angle, labelled as such.
  // Anti-lock-in — without it the archive becomes a cage.
  BET_EVERY_N_IDEAS: 5,
  // Dedupe: an idea is "already sent" if its normalized concept overlaps this
  // much with a previously sent one.
  DEDUPE_SIMILARITY_THRESHOLD: 0.62,
  DEDUPE_LOOKBACK_IDEAS: 200,
  // Over-generate, then keep the best N that survive dedupe.
  GENERATION_OVERSHOOT: 5,
  SERIES_PARTS_OFFERED: 3,
});

const IdeaStatus = Object.freeze({
  SENT:     'SENT',
  BANKED:   'BANKED',
  ACCEPTED: 'ACCEPTED', // she said she's shooting it
  REJECTED: 'REJECTED', // taste signal — high value over time
  REDRIPPED:'REDRIPPED',
});

const IdeaOrigin = Object.freeze({
  DRIP:      'DRIP',
  ON_DEMAND: 'ON_DEMAND',
  BANK:      'BANK',
  SERIES:    'SERIES',
});

// ---------------------------------------------------------------------------
// Proactive-messaging guard rails — a muted bot is a dead bot. All required.
// ---------------------------------------------------------------------------
const NudgeGuardRails = Object.freeze({
  MAX_PUSHES_PER_DAY: 1,
  STOP_AFTER_UNANSWERED_NUDGES: 3, // three silent drips -> stop pushing, stay available
  REMIX_WINDOW_MIN_DAYS: 30, // only surface winners aged 30–90 days for remixing
  REMIX_WINDOW_MAX_DAYS: 90,
  // Pattern-surfacing is the one thing she can't do for herself — but daily is noise.
  PATTERN_SURFACE_EVERY_N_DRIPS: 7,
});

// ---------------------------------------------------------------------------
// Timing. v1 fires once near her audience peak. These are DEFAULTS ONLY —
// the live values live in the bot_state row so a later learner can move them
// without a deploy. Do not read the constants directly at send time.
// ---------------------------------------------------------------------------
const DripTimingDefaults = Object.freeze({
  TIMEZONE: 'America/New_York', // confirm with Gana; her active-hours peak is ~7pm
  HOUR_LOCAL: 19,               // 7pm — observed peak (Jul 26, 7pm = 3.1K active)
  // The external cron pings every hour; this is the window it may fire in.
  FIRE_WINDOW_MINUTES: 59,
});

// ---------------------------------------------------------------------------
// Account facts used in copy. Kept here so no number is hardcoded in a string.
// ---------------------------------------------------------------------------
const AccountFacts = Object.freeze({
  HANDLE: '@ganadelray',
  AUDIENCE_PEAK_HOUR_LOCAL: 19,
  AUDIENCE_FEMALE_PCT: 81,
});

module.exports = {
  AnthropicModelForRole,
  EffortForRole,
  ConversationIntent,
  VideoFormatTag,
  HookStyle,
  TopicTag,
  InLaneTopicTags,
  MetricKind,
  AnalyticsWindowDays,
  DatePrecision,
  IngestConfig,
  RankingConfig,
  DataFreshness,
  IdeaConfig,
  IdeaStatus,
  IdeaOrigin,
  NudgeGuardRails,
  DripTimingDefaults,
  AccountFacts,
};
