// src/ideas/ideaBank.js
//
// Ideas are lottery tickets that arrive at random — in the car, mid-edit, in the
// shower. This catches them the instant they hit, and hands them back on a slow
// morning when she is stuck. Same engine as the drip, run inbound; near-zero
// extra cost.

const db = require('../db/supabaseClient');
const claude = require('../utils/claudeClient');
const archiveLib = require('../archive/converterArchive');
const prompts = require('./prompts');
const { makeLogger } = require('../utils/logger');
const { TopicTag } = require('../utils/constants');
const { cleanVoiceTranscript } = require('../utils/text');

const log = makeLogger('bank');

/**
 * Capture. Her input is a voice transcript: rambly, unpunctuated, mid-thought.
 * We keep her words and tag it — we do not evaluate it and we do not expand it.
 */
async function captureIdea(rawText) {
  const cleaned = cleanVoiceTranscript(rawText);
  const archive = await archiveLib.loadArchive();

  let interpreted = { cleaned_idea: cleaned, topic_tag: TopicTag.UNCLASSIFIED, closest_converter_note: '' };
  if (claude.isConfigured()) {
    try {
      interpreted = await claude.completeJson({
        role: 'SKILL_EXECUTION',
        system: prompts.BANK_SYSTEM,
        user: `Her voice note:\n"""${cleaned}"""`,
        schema: prompts.BANK_SCHEMA,
        maxTokens: 1500,
      });
    } catch (error) {
      log.warn('interpretation failed, banking raw', { message: error.message });
    }
  }

  const analogues = archiveLib.findAnalogues(archive, {
    text: interpreted.cleaned_idea,
    topicTags: [interpreted.topic_tag],
    limit: 1,
  });
  const match = analogues[0] || null;

  const entry = await db.bankIdea({
    id: db.newId(),
    raw_text: rawText,
    cleaned_text: interpreted.cleaned_idea,
    topic_tag: interpreted.topic_tag,
    matched_video_id: match ? match.id : null,
    match_note: match ? `“${String(match.caption).slice(0, 40)}” (${match.newFollowers} followers)` : null,
    redrip_count: 0,
    created_at: new Date().toISOString(),
  });

  log.info('idea banked', { topic: interpreted.topic_tag, matched: Boolean(match) });
  return entry;
}

/** Oldest un-redripped idea first; otherwise the one she has seen least recently. */
async function pickRedrip() {
  const banked = await db.getBankedIdeas();
  if (banked.length === 0) return null;
  const fresh = banked.filter((entry) => !entry.redripped_at);
  const pool = fresh.length ? fresh : banked;
  const chosen = pool.sort((a, b) => String(a.redripped_at || a.created_at)
    .localeCompare(String(b.redripped_at || b.created_at)))[0];
  await db.markBankedRedripped(chosen.id, chosen.redrip_count);
  return { banked: chosen };
}

async function listBanked() {
  return db.getBankedIdeas();
}

module.exports = { captureIdea, pickRedrip, listBanked };
