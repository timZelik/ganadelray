// src/router/skillRouter.js
//
// Intent -> handler -> one reply. Every reply is a statement; the bot asks a
// clarifying question only when it is genuinely blocked, and it never asks a
// second time.

const db = require('../db/supabaseClient');
const copy = require('../telegram/copy');
const scheduler = require('../schedule/dripScheduler');
const { ingestTranscript } = require('../ingest/analyticsIngestor');
const { enrichArchive } = require('../enrich/videoClassifier');
const { checkIdea } = require('../ideas/confidenceCheck');
const { captureIdea } = require('../ideas/ideaBank');
const { expandSeries } = require('../ideas/seriesExpansion');
const { writeHooks } = require('../ideas/hookWriter');
const { makeLogger } = require('../utils/logger');
const { ConversationIntent, IdeaStatus } = require('../utils/constants');
const { similarity } = require('../utils/text');

const log = makeLogger('router');

/** Resolve "the second one" / "the ab routine one" to an idea from the last drip. */
async function resolveReferencedIdea({ ideaReference, text }) {
  const recent = await db.getLastSentIdeas(6);
  if (recent.length === 0) return null;
  if (ideaReference && recent[ideaReference - 1]) return recent[ideaReference - 1];
  const numbered = String(text || '').match(/\b([123])\b/);
  if (numbered && recent[Number(numbered[1]) - 1]) return recent[Number(numbered[1]) - 1];
  const scored = recent
    .map((idea) => ({ idea, score: similarity(text || '', idea.concept) }))
    .sort((a, b) => b.score - a.score)[0];
  return scored && scored.score > 0.2 ? scored.idea : recent[0];
}

const handlers = {
  async [ConversationIntent.INGEST_ANALYTICS](text) {
    const summary = await ingestTranscript(text);
    await enrichArchive();
    const lines = [
      `Logged ${summary.rowCount} rows across ${summary.videoCount} videos (${summary.newVideos} new).`,
    ];
    if (summary.ambiguities.length) {
      // The one place a question is warranted: two rows are genuinely ambiguous.
      const first = summary.ambiguities[0];
      lines.push(`Two rows looked like the same video: “${copy.shortCaption(first.caption, 34)}” and “${copy.shortCaption(first.matched, 34)}”. Tell me if those are different videos and I'll split them.`);
    }
    lines.push(await scheduler.performanceSummary({ windowDays: 365 }));
    return lines.join('\n\n');
  },

  async [ConversationIntent.REQUEST_IDEAS](text, context) {
    const ideas = await scheduler.runOnDemandIdeas({ focusTopic: context.topicHint || null });
    return copy.formatDripMessage(ideas, { lead: 'Off your own converters:' });
  },

  async [ConversationIntent.CHECK_IDEA](text) {
    const result = await checkIdea(text);
    return result.message;
  },

  async [ConversationIntent.BANK_IDEA](text) {
    const entry = await captureIdea(text);
    return copy.formatBankAck(entry);
  },

  async [ConversationIntent.REQUEST_REMIX](text) {
    const ideas = await scheduler.runOnDemandIdeas({});
    return copy.formatDripMessage(ideas, { lead: 'Variations off that lane:' });
  },

  async [ConversationIntent.REQUEST_SERIES](text) {
    const result = await expandSeries({ hintText: text });
    if (!result) return 'No proven series starter in the archive yet — paste your latest analytics and I\'ll find one.';
    return result.message;
  },

  async [ConversationIntent.REQUEST_HOOKS](text) {
    const result = await writeHooks({ hintText: text });
    if (!result) return 'Tell me which idea and I\'ll write the hooks.';
    return result.message;
  },

  async [ConversationIntent.REVIEW_PERFORMANCE]() {
    return scheduler.performanceSummary({ windowDays: 365 });
  },

  async [ConversationIntent.ACCEPT_IDEA](text, context) {
    const idea = await resolveReferencedIdea({ ideaReference: context.ideaReference, text });
    if (idea) await db.setIdeaVerdict(idea.id, IdeaStatus.ACCEPTED, text);
    return copy.formatIdeaAccepted();
  },

  async [ConversationIntent.REJECT_IDEA](text, context) {
    // What she declines is high-value taste signal over time.
    const idea = await resolveReferencedIdea({ ideaReference: context.ideaReference, text });
    if (idea) await db.setIdeaVerdict(idea.id, IdeaStatus.REJECTED, text);
    return copy.formatIdeaRejected();
  },

  async [ConversationIntent.PAUSE_NUDGES]() {
    await db.updateBotState({ paused: true, paused_at: new Date().toISOString() });
    return copy.formatPaused();
  },

  async [ConversationIntent.RESUME_NUDGES]() {
    await db.updateBotState({ paused: false, paused_at: null, unanswered_nudges: 0 });
    return copy.formatResumed();
  },

  async [ConversationIntent.SMALL_TALK]() {
    // Deliberately does not force a skill and does not ask a question back.
    return 'Here when you want ideas.';
  },
};

/**
 * Entry point for every inbound message. Registers the response first — that
 * stamp is the raw material for the timing learner, and it must be recorded
 * even if the handler below fails.
 */
async function handleMessage(text, context = {}) {
  await scheduler.registerInbound();
  const handler = handlers[context.intent] || handlers[ConversationIntent.SMALL_TALK];
  log.info('handling', { intent: context.intent, source: context.source });
  try {
    return await handler(text, context);
  } catch (error) {
    log.error('handler failed', { intent: context.intent, message: error.message });
    return 'That one broke on my side. Nothing lost — try again in a minute.';
  }
}

module.exports = { handleMessage, handlers, resolveReferencedIdea };
