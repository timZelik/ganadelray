// src/ideas/seriesExpansion.js
//
// The highest-leverage origination multiplier available. Multi-part content
// recurs in her follower rankings — "apartment hacks part 1/2", "Shera Seven
// part 3/5" — because people follow to see the next part. Turning one proven
// video into the other three parts converts one idea into a week of content,
// which attacks the origination bottleneck directly.

const claude = require('../utils/claudeClient');
const archiveLib = require('../archive/converterArchive');
const prompts = require('./prompts');
const copy = require('../telegram/copy');
const { persistIdeas } = require('./ideaGenerator');
const { makeLogger } = require('../utils/logger');
const { IdeaConfig, IdeaOrigin, IdeaStatus, InLaneTopicTags } = require('../utils/constants');
const { shortHash, similarity } = require('../utils/text');

const log = makeLogger('series');

/** Best candidate: an existing part-1, else her strongest in-lane converter. */
function pickSource(archive, hintText) {
  const ranked = archiveLib.rankConverters(archive, { limit: 50 })
    .filter((video) => video.topicTags.some((tag) => InLaneTopicTags.includes(tag)));
  if (ranked.length === 0) return null;

  if (hintText) {
    const matched = ranked
      .map((video) => ({ video, score: similarity(hintText, video.caption) }))
      .sort((a, b) => b.score - a.score)[0];
    if (matched && matched.score > 0.2) return matched.video;
  }

  const partOne = ranked.find((video) => video.isSeries && (video.seriesPart === 1 || video.seriesPart === null));
  return partOne || ranked[0];
}

async function expandSeries({ hintText = null, parts = IdeaConfig.SERIES_PARTS_OFFERED } = {}) {
  const archive = await archiveLib.loadArchive();
  const source = pickSource(archive, hintText);
  if (!source) return null;

  const result = await claude.completeJson({
    role: 'SKILL_EXECUTION',
    system: prompts.SERIES_SYSTEM,
    user: [
      `PART 1 (already made, proven):`,
      prompts.renderSources([source]),
      `Write the next ${parts} parts of this series. Number them from ${(source.seriesPart || 1) + 1}.`,
    ].join('\n\n'),
    schema: prompts.SERIES_SCHEMA,
    maxTokens: 4000,
  });

  const ideas = (result.parts || []).slice(0, parts).map((part) => ({
    ideaKey: shortHash(String(part.concept).toLowerCase()),
    concept: part.concept,
    hook: part.hook,
    onscreenText: part.onscreen_text,
    whyItConverts: `Part ${part.part_number} of a format that already converted — people follow for the next part.`,
    sourceVideoId: source.id,
    sourceCaption: source.caption,
    sourceFollowers: source.newFollowers,
    sourceWindowDays: source.windowDays,
    topicTag: source.topicTags.find((tag) => InLaneTopicTags.includes(tag)),
    formatTag: source.formatTag,
    hookStyle: source.hookStyle,
    isBet: false,
  }));

  const stored = await persistIdeas(ideas, { origin: IdeaOrigin.SERIES, status: IdeaStatus.SENT });
  log.info('series expanded', { source: source.id, parts: stored.length });

  return {
    source,
    seriesName: result.series_name,
    ideas: stored,
    message: copy.formatSeriesOffer(source, stored),
  };
}

module.exports = { expandSeries, pickSource };
