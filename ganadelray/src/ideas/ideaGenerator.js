// src/ideas/ideaGenerator.js
//
// The primary feature. Daily:
//
//   pull top follower-converters (weighted recent x high-follower)
//     -> rotate through her converter PATTERNS {format, hook, topic}
//     -> Sonnet generates fresh angles, each carrying a source winner + count
//     -> dedupe against everything already sent
//     -> ~1 in 5 is an explicit BET (anti-lock-in)
//     -> hand back as statements
//
// Validation is not optional here. An idea that cites a source video that does
// not exist, or drifts off-lane into her viral-but-non-converting content, is
// worse than no idea — it breaks the trust that makes her open the message.

const db = require('../db/supabaseClient');
const claude = require('../utils/claudeClient');
const archiveLib = require('../archive/converterArchive');
const prompts = require('./prompts');
const { makeLogger } = require('../utils/logger');
const { IdeaConfig, IdeaStatus, IdeaOrigin, InLaneTopicTags, RankingConfig } = require('../utils/constants');
const { similarity, shortHash } = require('../utils/text');

const log = makeLogger('ideas');

/**
 * ~1 in 5 ideas is a bet. Deterministic rather than random so the ratio is
 * actually honoured over time instead of clustering: a bet goes out when enough
 * non-bet ideas have accumulated since the last one — and always on the very
 * first drip, so the anti-lock-in behaviour is visible from day one.
 */
function shouldIncludeBet(recentIdeas) {
  if (recentIdeas.length === 0) return true;
  let since = 0;
  for (const idea of recentIdeas) { // newest first
    if (idea.is_bet) return since >= IdeaConfig.BET_EVERY_N_IDEAS;
    since += 1;
  }
  return since >= IdeaConfig.BET_EVERY_N_IDEAS;
}

/** An idea is a repeat if it reads like something already sent — or like a sibling in the same batch. */
function isDuplicate(concept, previousConcepts) {
  return previousConcepts.some(
    (previous) => similarity(concept, previous) >= IdeaConfig.DEDUPE_SIMILARITY_THRESHOLD,
  );
}

function normalizeIdea(raw, sourceById) {
  const source = sourceById.get(raw.source_video_id);
  return {
    ideaKey: shortHash(String(raw.concept).toLowerCase()),
    concept: String(raw.concept).trim(),
    hook: String(raw.hook || '').trim(),
    onscreenText: String(raw.onscreen_text || '').trim(),
    whyItConverts: String(raw.why_it_converts || '').trim(),
    sourceVideoId: source ? source.id : null,
    sourceCaption: source ? source.caption : null,
    sourceFollowers: source ? source.newFollowers : null,
    sourceWindowDays: source ? source.windowDays : null,
    topicTag: raw.topic_tag,
    formatTag: raw.format_tag,
    hookStyle: raw.hook_style,
    isBet: Boolean(raw.is_bet),
  };
}

/**
 * Drop anything that fails the three non-negotiables: real source, in-lane,
 * not a repeat. Silently keeping a bad idea would be the expensive mistake.
 */
function validateAndDedupe(candidates, sourceById, previousConcepts) {
  const kept = [];
  const seen = previousConcepts.slice();
  const rejected = [];

  for (const raw of candidates) {
    const idea = normalizeIdea(raw, sourceById);
    if (!idea.sourceVideoId) { rejected.push(['unknown source video', idea.concept]); continue; }
    if (!InLaneTopicTags.includes(idea.topicTag)) { rejected.push(['off-lane topic', idea.concept]); continue; }
    if (!idea.concept || idea.concept.split(/\s+/).length < 4) { rejected.push(['too vague', idea.concept]); continue; }
    if (isDuplicate(idea.concept, seen)) { rejected.push(['duplicate', idea.concept]); continue; }
    seen.push(idea.concept);
    kept.push(idea);
  }

  if (rejected.length) log.warn('ideas rejected', { count: rejected.length, reasons: rejected.slice(0, 5) });
  return kept;
}

/**
 * At most one bet per batch, and only an idea the model actually WROTE as a bet.
 *
 * The tempting shortcut — promoting the idea with the weakest source when no bet
 * survived validation — is a lie: it labels a proven-derivative angle "untested".
 * If no real bet came through, the batch just goes out without one and the quota
 * rolls to the next drip, which is what the lookback in shouldIncludeBet does.
 */
function selectIdeas(validated, count, includeBet) {
  const bets = validated.filter((idea) => idea.isBet);
  const regular = validated.filter((idea) => !idea.isBet);

  if (!includeBet) {
    bets.forEach((idea) => { idea.isBet = false; });
    return [...regular, ...bets].slice(0, count);
  }
  if (bets.length === 0) {
    log.info('bet was due but none survived validation — sending without one');
    return regular.slice(0, count);
  }
  bets.slice(1).forEach((idea) => { idea.isBet = false; });
  const chosen = [...regular.slice(0, count - 1), bets[0]];
  return chosen.concat(bets.slice(1)).slice(0, count);
}

/**
 * @param {object} options
 * @param {number} options.count       how many ideas to hand back
 * @param {string} options.patternNote optional non-obvious pattern to lean on
 * @param {string} options.focusTopic  optional topic to bias toward (on-demand)
 */
async function generateIdeas({ count = IdeaConfig.IDEAS_PER_DRIP, patternNote = null, focusTopic = null } = {}) {
  const archive = await archiveLib.loadArchive();
  let pool = archiveLib.sourcePool(archive, { limit: RankingConfig.SOURCE_POOL_SIZE });

  // Only ever build on things that actually converted, inside her lane.
  pool = pool.filter((video) => video.topicTags.some((tag) => InLaneTopicTags.includes(tag)));
  if (focusTopic) {
    const focused = pool.filter((video) => video.topicTags.includes(focusTopic));
    if (focused.length >= 2) pool = focused;
  }
  if (pool.length === 0) {
    throw new Error('No in-lane converters in the archive yet — ingest analytics first.');
  }

  const recentIdeas = await db.getRecentIdeas(IdeaConfig.DEDUPE_LOOKBACK_IDEAS);
  const previousConcepts = recentIdeas.map((idea) => idea.concept);
  const includeBet = shouldIncludeBet(recentIdeas);

  const result = await claude.completeJson({
    role: 'SKILL_EXECUTION',
    system: prompts.ideaSystemPrompt({ includeBet }),
    user: prompts.ideaUserPrompt({
      sources: pool,
      alreadySent: previousConcepts.slice(0, 25),
      count: count + IdeaConfig.GENERATION_OVERSHOOT,
      patternNote,
    }),
    schema: prompts.IDEA_SCHEMA,
    maxTokens: 8000,
  });

  const sourceById = new Map(pool.map((video) => [video.id, video]));
  const validated = validateAndDedupe(result.ideas || [], sourceById, previousConcepts);
  const ideas = selectIdeas(validated, count, includeBet);

  log.info('generated', { asked: count, kept: ideas.length, bet: includeBet });
  return ideas;
}

/** Writes ideas to the log — which doubles as the dedupe corpus and taste record. */
async function persistIdeas(ideas, { origin = IdeaOrigin.DRIP, status = IdeaStatus.SENT, dripId = null } = {}) {
  const rows = ideas.map((idea) => ({
    id: db.newId(),
    idea_key: idea.ideaKey,
    concept: idea.concept,
    hook: idea.hook,
    onscreen_text: idea.onscreenText,
    why_it_converts: idea.whyItConverts,
    source_video_id: idea.sourceVideoId,
    source_caption: idea.sourceCaption,
    source_followers: idea.sourceFollowers,
    source_window_days: idea.sourceWindowDays,
    topic_tag: idea.topicTag,
    format_tag: idea.formatTag,
    hook_style: idea.hookStyle,
    is_bet: idea.isBet,
    status,
    origin,
    drip_id: dripId,
    created_at: new Date().toISOString(),
  }));
  const saved = await db.saveIdeas(rows);
  return ideas.map((idea, index) => ({ ...idea, id: (saved[index] || rows[index]).id }));
}

module.exports = { generateIdeas, persistIdeas, shouldIncludeBet, validateAndDedupe, selectIdeas };
