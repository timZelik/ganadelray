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
  INTENT_CLASSIFICATION: 'claude-haiku-4-5-20251001', // <200 token prompt, structured
  SKILL_EXECUTION:       'claude-sonnet-4-6',         // generation + vision extraction
  DEEP_SYNTHESIS:        'claude-opus-4-6',           // monthly planning only — rare
});

// ---------------------------------------------------------------------------
// Intent classes — the 8 things Gana can be trying to do in one message.
// Haiku maps her text to exactly one of these; skillRouter maps each to a handler.
// ---------------------------------------------------------------------------
const ConversationIntent = Object.freeze({
  INGEST_ANALYTICS:   'INGEST_ANALYTICS',   // she forwarded a CSV or screenshot
  CHECK_IDEA:         'CHECK_IDEA',          // "will this do well?" -> analogue retrieval
  REQUEST_REMIX:      'REQUEST_REMIX',       // "give me variations of X"
  REVIEW_PERFORMANCE: 'REVIEW_PERFORMANCE',  // "how did last week go?"
  ANSWER_POSTMORTEM:  'ANSWER_POSTMORTEM',   // replying to "what drove that video?"
  PAUSE_NUDGES:       'PAUSE_NUDGES',        // "pause" / "stop messaging me"
  RESUME_NUDGES:      'RESUME_NUDGES',
  SMALL_TALK:         'SMALL_TALK',          // everything else — reply briefly, don't force a skill
});

// ---------------------------------------------------------------------------
// TAG TAXONOMY — the spine of retrieval. Three closed vocabularies.
//
// format_tag and hook_style are universal; committed now.
// topic_tags is account-specific; STUB — populate from Gana's real 60-day
// content, because guessing her niche is where a closed enum goes wrong.
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

// WHAT the video is about. STUB — do not treat as complete.
// Fill from Gana's actual 60-day export; every member must be something she
// genuinely makes, or matching will bucket unlike videos together.
const TopicTag = Object.freeze({
  // TODO(populate-from-export): derive from her real content, not guesses.
  UNCLASSIFIED: 'UNCLASSIFIED',
});

// ---------------------------------------------------------------------------
// CSV COLUMN MAP — raw TikTok export header -> our canonical field.
// STUB. This is THE one-object edit the real export unblocks (Branch A/B).
// Keys = whatever TikTok's headers literally say; values = schema fields.
// ---------------------------------------------------------------------------
const TiktokCsvColumnMap = Object.freeze({
  // 'Video':            'video_id',      // <- confirm against real headers
  // 'Post time':        'posted_at',
  // 'Video views':      'views',
  // 'Likes':            'likes',
  // 'Comments':         'comments',
  // 'Shares':           'shares',
  // 'New followers':    'new_followers', // <- the branch point: is this here at all?
});

// ---------------------------------------------------------------------------
// Ranking & freshness — the business rules the plan settled on.
// ---------------------------------------------------------------------------
const RankingConfig = Object.freeze({
  PRIMARY_SORT_FIELD: 'new_followers', // volume, NOT rate — rate rewards low-view flukes
  ANALOGUE_RESULT_LIMIT: 5,
});

const DataFreshness = Object.freeze({
  STALE_AFTER_DAYS: 8, // beyond this, every ranking response prefixes with data age
  INGEST_WINDOW_DAYS: 28, // re-score a rolling 28-day window each weekly ingest
});

// ---------------------------------------------------------------------------
// Proactive-messaging guard rails — a muted bot is a dead bot. All required.
// ---------------------------------------------------------------------------
const NudgeGuardRails = Object.freeze({
  MAX_PUSHES_PER_DAY: 1,
  STOP_AFTER_UNANSWERED_NUDGES: 3, // three silent nudges -> stop asking, flag staleness only
  REMIX_WINDOW_MIN_DAYS: 30, // only surface winners aged 30–90 days for remixing
  REMIX_WINDOW_MAX_DAYS: 90,
});

module.exports = {
  AnthropicModelForRole,
  ConversationIntent,
  VideoFormatTag,
  HookStyle,
  TopicTag,
  TiktokCsvColumnMap,
  RankingConfig,
  DataFreshness,
  NudgeGuardRails,
};
