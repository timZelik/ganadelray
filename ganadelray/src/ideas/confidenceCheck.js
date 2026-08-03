// src/ideas/confidenceCheck.js
//
// Inverse mode: she pitches her own idea, the engine runs backwards and returns
// her closest converters and how near a match it is.
//
// It NEVER predicts virality. An empty match is "unproven, not a no" — because
// her real pain is time invested, the right answer to unproven is always "shoot
// a cheap fast version", never "don't".

const claude = require('../utils/claudeClient');
const archiveLib = require('../archive/converterArchive');
const copy = require('../telegram/copy');
const prompts = require('./prompts');
const { makeLogger } = require('../utils/logger');
const { TopicTag } = require('../utils/constants');
const { cleanVoiceTranscript } = require('../utils/text');

const log = makeLogger('confidence');

async function checkIdea(rawText) {
  const text = cleanVoiceTranscript(rawText);
  const archive = await archiveLib.loadArchive();

  let interpreted = {
    restated_idea: text,
    topic_tag: TopicTag.UNCLASSIFIED,
    format_tag: null,
    in_lane: true,
    verdict: 'UNPROVEN',
    note: '',
  };
  if (claude.isConfigured()) {
    try {
      interpreted = await claude.completeJson({
        role: 'SKILL_EXECUTION',
        system: prompts.CONFIDENCE_SYSTEM,
        user: `Her pitch:\n"""${text}"""`,
        schema: prompts.CONFIDENCE_SCHEMA,
        maxTokens: 1500,
      });
    } catch (error) {
      log.warn('interpretation failed, matching on raw text', { message: error.message });
    }
  }

  const analogues = archiveLib.findAnalogues(archive, {
    text: interpreted.restated_idea,
    topicTags: [interpreted.topic_tag],
    formatTag: interpreted.format_tag,
  });

  const parts = [copy.formatConfidenceCheck(interpreted.restated_idea, analogues)];
  if (interpreted.note) parts.push(copy.escapeHtml(interpreted.note));
  if (interpreted.in_lane === false && analogues.length > 0) {
    parts.push('That sits outside the lane that actually converts for you — treat it as a swing, not a plan.');
  }

  return { message: parts.join('\n\n'), analogues, interpreted };
}

module.exports = { checkIdea };
