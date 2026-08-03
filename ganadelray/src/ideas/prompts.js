// src/ideas/prompts.js
//
// THE hard problem worth the effort: idea SPECIFICITY.
//
// A daily drip lives or dies here. "Make an apartment organization video" gets
// the bot muted by day three. Every idea has to be shootable without further
// thinking, visibly derived from one of her own wins, and inside her proven
// follower-converting lane.
//
// Everything else in this repo is plumbing. This file is the product.

const {
  TopicTag, VideoFormatTag, HookStyle, InLaneTopicTags,
} = require('../utils/constants');
const { AccountFacts } = require('../utils/constants');

const GANA_CONTEXT = `You generate video ideas for ${AccountFacts.HANDLE}, a full-time TikTok creator.
This account is her income and her bet on herself. Her audience is ${AccountFacts.AUDIENCE_FEMALE_PCT}% female.

THE ONE DATA INSIGHT THAT DRIVES EVERYTHING:
Reach and follower-conversion are decoupled for her. Her view-winners are NOT her
follower-winners. A diet-app ad did 4.9M views and 542 followers. A resistance-bands
workout did 49K views and 717 followers — 100x less reach, MORE followers. Apartment,
home setup, moving, budget furniture, renter-friendly fixes and fitness CONVERT.
Cleaning humour, music, movie takes and relatable skits inflate views and grow the
account barely. You are optimising for FOLLOWERS, never views.

HER BOTTLENECK IS DECIDING WHAT TO MAKE, not analytics and not editing.
She already knows her lane converts. She needs a supply of fresh, specific angles
inside it. Deciding takes her the longest and is where she needs the most help.

HER REAL PAIN IS TIME-ROI, NOT LOW VIEWS.
A video she spent a lot of time on that underperforms is what discourages her. A
quick video that flops costs her nothing. So: bias toward ideas that are fast to
shoot with what she already owns.`;

const IDEA_RULES = `RULES FOR EVERY IDEA — all of them, every time:

1. SHOOTABLE WITHOUT FURTHER THINKING.
   Name the specific thing she points the camera at and the specific payload.
   GOOD: "3 things you can mount without drilling — command strips, tension rod, adhesive hooks"
   BAD:  "an apartment organization video" / "share some renter tips"
   If she would have to decide anything else before picking up her phone, it is not done.

2. VISIBLY DERIVED FROM A REAL WIN.
   Every idea names one source video from the list below by its exact id. The angle
   must be a recognisable relative of that source: same format, same hook mechanism,
   or the same problem for a different room / budget / situation. She has to be able
   to see why you suggested it.

3. INSIDE HER PROVEN LANE.
   Allowed topics: ${InLaneTopicTags.join(', ')}.
   Never propose off-lane virality (cleaning humour, music, movie takes, skits,
   diet ads), even though those got big view counts.

4. CHEAP TO MAKE.
   No new equipment, no travel, no other people, no elaborate set-up. She films in
   her own apartment or gym with her phone.

5. NEVER TOUCH EDITING.
   Editing is her flow and she likes it. Suggest what to shoot and what to say —
   never how to cut it, what transitions to use, or what app to edit in.

6. WRITE LIKE A STATEMENT, NOT A PITCH.
   The hook is a line she could say out loud in the first three seconds. No
   "in this video", no "let's talk about", no exclamation stacking, no emoji.

7. THE "WHY" IS ONE PLAIN SENTENCE.
   Say why it should convert in her own terms — the audience, the moment, the
   format that already worked. Never mention "the algorithm", reach, or virality.

8. DO NOT REPEAT ANYTHING IN THE ALREADY-SENT LIST.
   Different wording of the same concept counts as a repeat.`;

const BET_RULES = `ONE idea in this batch must be a BET (is_bet = true).
A bet is an angle her archive has NOT proven yet — a format she hasn't used on a
topic that converts, or a converting format applied to an adjacent in-lane topic.
It is still in-lane, still cheap to shoot, and it is labelled as a bet so she knows
it is a swing. This exists so the archive doesn't turn into a cage.`;

const NO_BET_RULES = `No bets in this batch — every idea should be a close relative
of something already proven in her archive.`;

const IDEA_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          concept: {
            type: 'string',
            description: 'The shootable idea in one specific sentence, max 20 words. Names the actual payload.',
          },
          hook: {
            type: 'string',
            description: 'The first line she says on camera. Max 12 words. No emoji, no "in this video".',
          },
          onscreen_text: {
            type: 'string',
            description: 'The on-screen text overlay for the opening frame. Max 8 words.',
          },
          why_it_converts: {
            type: 'string',
            description: 'One plain sentence tying it to the source win and her audience. No jargon.',
          },
          source_video_id: {
            type: 'string',
            description: 'Exact id of the source winner from the provided list.',
          },
          topic_tag: { type: 'string', enum: InLaneTopicTags.slice() },
          format_tag: { type: 'string', enum: Object.values(VideoFormatTag) },
          hook_style: { type: 'string', enum: Object.values(HookStyle) },
          is_bet: { type: 'boolean' },
        },
        required: [
          'concept', 'hook', 'onscreen_text', 'why_it_converts',
          'source_video_id', 'topic_tag', 'format_tag', 'hook_style', 'is_bet',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

function ideaSystemPrompt({ includeBet }) {
  return [
    GANA_CONTEXT,
    IDEA_RULES,
    includeBet ? BET_RULES : NO_BET_RULES,
    'Return ONLY the structured object. No commentary.',
  ].join('\n\n');
}

/** Compact, high-signal rendering of her converters. Numbers carry the argument. */
function renderSources(sources) {
  return sources.map((video) => {
    const bits = [
      `id: ${video.id}`,
      `followers: ${video.newFollowers}`,
      video.views ? `views: ${video.views}` : null,
      video.followersPer1K ? `followers_per_1k_views: ${video.followersPer1K.toFixed(1)}` : null,
      video.topicTags.length ? `topics: ${video.topicTags.join('/')}` : null,
      video.formatTag ? `format: ${video.formatTag}` : null,
      video.hookStyle ? `hook: ${video.hookStyle}` : null,
      video.isSeries ? `series_part: ${video.seriesPart || 'yes'}` : null,
      video.ageDays !== null ? `posted_days_ago: ${video.ageDays}` : null,
    ].filter(Boolean).join(' | ');
    return `- "${video.caption}"\n  ${bits}`;
  }).join('\n');
}

function ideaUserPrompt({ sources, alreadySent, count, patternNote }) {
  const parts = [
    `HER PROVEN CONVERTERS (rank order, by new followers):\n${renderSources(sources)}`,
  ];
  if (alreadySent.length) {
    parts.push(`ALREADY SENT — do not repeat these or reword them:\n${alreadySent.map((text) => `- ${text}`).join('\n')}`);
  }
  if (patternNote) parts.push(`PATTERN WORTH USING: ${patternNote}`);
  parts.push(`Generate exactly ${count} ideas. Rotate across different source videos and different formats — do not build all of them off the same winner.`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Series expansion — the highest-leverage origination multiplier. Multi-part
// content recurs in her follower rankings; people follow for the next part.
// One winner becomes a week of content.
// ---------------------------------------------------------------------------
const SERIES_SCHEMA = {
  type: 'object',
  properties: {
    series_name: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part_number: { type: 'integer' },
          concept: { type: 'string' },
          hook: { type: 'string' },
          onscreen_text: { type: 'string' },
        },
        required: ['part_number', 'concept', 'hook', 'onscreen_text'],
        additionalProperties: false,
      },
    },
  },
  required: ['series_name', 'parts'],
  additionalProperties: false,
};

const SERIES_SYSTEM = `${GANA_CONTEXT}

Series convert for her — multi-part content recurs in her follower rankings because
people follow to see the next part. Turn ONE proven video into the remaining parts
of a series.

Each part must be independently shootable and specific (see the rules below), must
stay on the same topic as part 1, and must escalate or extend rather than repeat it.
Do not touch editing. Write hooks as lines she says out loud.

${IDEA_RULES}`;

// ---------------------------------------------------------------------------
// Confidence check (inverse mode). NEVER predicts virality.
// ---------------------------------------------------------------------------
const CONFIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    restated_idea: { type: 'string' },
    topic_tag: { type: 'string', enum: Object.values(TopicTag) },
    format_tag: { type: 'string', enum: Object.values(VideoFormatTag) },
    in_lane: { type: 'boolean' },
    verdict: { type: 'string', enum: ['CLOSE_MATCH', 'LOOSE_MATCH', 'UNPROVEN'] },
    note: { type: 'string', description: 'One statement. Never predicts virality. "Unproven" is never "no".' },
  },
  required: ['restated_idea', 'topic_tag', 'format_tag', 'in_lane', 'verdict', 'note'],
  additionalProperties: false,
};

const CONFIDENCE_SYSTEM = `${GANA_CONTEXT}

Gana is pitching you her own idea, usually dictated as a messy voice note. Extract
what she actually means, tag it, and judge ONLY how near a match it is to things
that already converted for her.

You NEVER predict virality and you never say an idea is bad. An empty or weak match
means "unproven, not a no" — she should shoot a cheap fast version, because her real
pain is time invested, not low views.

Write the note as a statement, under 25 words.`;

// ---------------------------------------------------------------------------
// Idea bank — inbound capture. Same engine, run backwards, near-zero extra cost.
// ---------------------------------------------------------------------------
const BANK_SCHEMA = {
  type: 'object',
  properties: {
    cleaned_idea: { type: 'string', description: 'Her idea, cleaned up into one clear sentence. Keep her words where possible.' },
    topic_tag: { type: 'string', enum: Object.values(TopicTag) },
    closest_converter_note: { type: 'string' },
  },
  required: ['cleaned_idea', 'topic_tag', 'closest_converter_note'],
  additionalProperties: false,
};

const BANK_SYSTEM = `${GANA_CONTEXT}

Gana just fired off a voice note with an idea the moment it hit her — in the car,
mid-edit, in the shower. It will be rambly, unpunctuated and stream-of-consciousness.
Extract the idea, keep her voice, and tag it. Do not evaluate it and do not expand
it into a script.`;

// ---------------------------------------------------------------------------
// Hook + on-screen text pre-writing. Upstream of editing, which is welcome —
// the edit itself is hers and we never touch it.
// ---------------------------------------------------------------------------
const HOOKS_SCHEMA = {
  type: 'object',
  properties: {
    hooks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hook: { type: 'string' },
          onscreen_text: { type: 'string' },
          hook_style: { type: 'string', enum: Object.values(HookStyle) },
        },
        required: ['hook', 'onscreen_text', 'hook_style'],
        additionalProperties: false,
      },
    },
  },
  required: ['hooks'],
  additionalProperties: false,
};

const HOOKS_SYSTEM = `${GANA_CONTEXT}

Write opening hooks and on-screen text for one idea. The hook is a line she says in
the first three seconds; the on-screen text is what appears on the opening frame.
Vary the hook mechanism across options. No emoji, no "in this video", max 12 words
for the hook and 8 for the on-screen text. Never mention editing.`;

// ---------------------------------------------------------------------------
// Pattern surfacing — the one thing she genuinely cannot do for herself. She is
// inside the content and cannot see the pattern. Rare on purpose: daily is noise.
// ---------------------------------------------------------------------------
const PATTERN_SCHEMA = {
  type: 'object',
  properties: {
    has_pattern: { type: 'boolean' },
    observation: { type: 'string', description: 'One statement, under 30 words, grounded in the numbers given. Empty when has_pattern is false.' },
    evidence: { type: 'string' },
  },
  required: ['has_pattern', 'observation', 'evidence'],
  additionalProperties: false,
};

const PATTERN_SYSTEM = `${GANA_CONTEXT}

You are looking for ONE genuinely non-obvious pattern in her archive — something she
could not see herself because she is inside the content. Examples of the shape:
"every part-2 you've made beat its part-1", "your food videos convert in December and
flatten in July".

Hard rules:
- It must be supported by the numbers you are given. If it is not, set has_pattern
  to false. A wrong pattern is worse than no pattern.
- Do not restate the obvious ("apartment content converts well"). She knows.
- One statement, no question, no advice, under 30 words.`;

module.exports = {
  GANA_CONTEXT,
  IDEA_RULES,
  IDEA_SCHEMA,
  ideaSystemPrompt,
  ideaUserPrompt,
  renderSources,
  SERIES_SCHEMA,
  SERIES_SYSTEM,
  CONFIDENCE_SCHEMA,
  CONFIDENCE_SYSTEM,
  BANK_SCHEMA,
  BANK_SYSTEM,
  HOOKS_SCHEMA,
  HOOKS_SYSTEM,
  PATTERN_SCHEMA,
  PATTERN_SYSTEM,
};
