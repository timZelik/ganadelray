// src/router/intentClassifier.js
//
// One message -> exactly one intent. Haiku does the interpretation, because her
// input is dictated: rambly, unpunctuated, stream-of-consciousness. Treat it the
// way a good assistant treats a hurried voice memo — extract structure, do not
// demand clean commands.
//
// A handful of unambiguous cases are decided without a model call: "pause" must
// work instantly and must never depend on the network.

const claude = require('../utils/claudeClient');
const { makeLogger } = require('../utils/logger');
const { ConversationIntent } = require('../utils/constants');
const { looksLikeAnalytics } = require('../ingest/analyticsIngestor');
const { cleanVoiceTranscript } = require('../utils/text');

const log = makeLogger('intent');

const FAST_PATHS = [
  [ConversationIntent.PAUSE_NUDGES, /^\s*(pause|stop|mute|shut up|no more)\b/i],
  [ConversationIntent.RESUME_NUDGES, /^\s*(resume|unpause|start again|go again|back on)\b/i],
];

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: Object.values(ConversationIntent) },
    topic_hint: { type: ['string', 'null'] },
    idea_reference: {
      type: ['integer', 'null'],
      description: 'If she referred to a numbered idea from the last drip, its number.',
    },
  },
  required: ['intent', 'topic_hint', 'idea_reference'],
  additionalProperties: false,
};

const INTENT_SYSTEM = `Classify one message from Gana, a TikTok creator, to her idea bot.
She dictates into her phone, so expect rambling, no punctuation, and mid-thought starts.

- REQUEST_IDEAS: she wants ideas now ("what should I make", "give me something").
- CHECK_IDEA: she is pitching an idea and wants to know how it compares to what has worked.
- BANK_IDEA: she is dumping an idea to save for later, not asking for a response.
- REQUEST_REMIX: she wants variations on a specific existing video.
- REQUEST_SERIES: she wants to turn something into a multi-part series.
- REQUEST_HOOKS: she wants the hook or on-screen text written for an idea.
- REVIEW_PERFORMANCE: she is asking how videos did.
- INGEST_ANALYTICS: the message is pasted analytics data.
- ACCEPT_IDEA / REJECT_IDEA: she is responding to an idea the bot sent.
- PAUSE_NUDGES / RESUME_NUDGES: she wants the daily messages off or back on.
- SMALL_TALK: everything else.

CHECK_IDEA vs BANK_IDEA is the subtle one: if she is asking anything ("would this
work", "thoughts") it is CHECK_IDEA; if she is just recording it ("idea:", "note
to self", "save this") it is BANK_IDEA.`;

async function classifyIntent(rawText) {
  const text = cleanVoiceTranscript(rawText);

  for (const [intent, pattern] of FAST_PATHS) {
    if (pattern.test(text)) return { intent, topicHint: null, ideaReference: null, source: 'fast-path' };
  }
  if (looksLikeAnalytics(text)) {
    return { intent: ConversationIntent.INGEST_ANALYTICS, topicHint: null, ideaReference: null, source: 'fast-path' };
  }
  if (!claude.isConfigured()) {
    return { intent: ConversationIntent.SMALL_TALK, topicHint: null, ideaReference: null, source: 'no-model' };
  }

  try {
    const result = await claude.completeJson({
      role: 'INTENT_CLASSIFICATION',
      system: INTENT_SYSTEM,
      user: text,
      schema: INTENT_SCHEMA,
      maxTokens: 300,
    });
    return {
      intent: result.intent,
      topicHint: result.topic_hint || null,
      ideaReference: result.idea_reference || null,
      source: 'model',
    };
  } catch (error) {
    log.warn('classification failed, treating as small talk', { message: error.message });
    return { intent: ConversationIntent.SMALL_TALK, topicHint: null, ideaReference: null, source: 'error' };
  }
}

module.exports = { classifyIntent };
