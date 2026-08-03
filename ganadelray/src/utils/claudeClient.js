// src/utils/claudeClient.js
//
// THE ONLY FILE THAT TOUCHES THE ANTHROPIC SDK.
//
// Model routing is by ROLE, never by literal model string at the call site:
//   INTENT_CLASSIFICATION -> Haiku   (short, structured, high volume)
//   SKILL_EXECUTION       -> Sonnet  (idea generation, tagging, hook writing)
//   DEEP_SYNTHESIS        -> Opus    (pattern surfacing — rare, high value)
//
// The SDK is required lazily so ingest/ranking self-checks run without it
// installed and without an API key.

const { makeLogger } = require('./logger');
const { AnthropicModelForRole, EffortForRole } = require('./constants');

const log = makeLogger('claude');

let sdk = null;

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client() {
  if (!sdk) {
    const Anthropic = require('@anthropic-ai/sdk');
    sdk = new Anthropic();
  }
  return sdk;
}

function assertConfigured() {
  if (!isConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set — no model calls are possible.');
  }
}

/**
 * Roles above Haiku get adaptive thinking plus an effort hint. Haiku 4.5 rejects
 * `effort`, so it gets neither — keeping this in one place is the whole point of
 * routing by role.
 */
function tuningForRole(role) {
  const effort = EffortForRole[role];
  if (!effort) return {};
  return {
    thinking: { type: 'adaptive' },
    output_config: { effort },
  };
}

function firstTextBlock(response) {
  const block = (response.content || []).find((item) => item.type === 'text');
  return block ? block.text : '';
}

/**
 * Structured call. `schema` is a JSON Schema object; the response is guaranteed
 * to validate against it, so callers can read fields without defensive parsing.
 */
async function completeJson({ role, system, user, schema, maxTokens = 4000 }) {
  assertConfigured();
  const model = AnthropicModelForRole[role];
  const tuning = tuningForRole(role);
  const response = await client().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    ...tuning,
    output_config: {
      ...(tuning.output_config || {}),
      format: { type: 'json_schema', schema },
    },
  });

  if (response.stop_reason === 'refusal') {
    log.warn('model declined', { role, model });
    throw new Error('Model declined this request.');
  }

  const text = firstTextBlock(response);
  try {
    return JSON.parse(text);
  } catch (error) {
    log.error('structured output was not JSON', { role, model, preview: text.slice(0, 200) });
    throw error;
  }
}

/** Free-text call. Used for short conversational replies only. */
async function completeText({ role, system, user, maxTokens = 1200 }) {
  assertConfigured();
  const model = AnthropicModelForRole[role];
  const response = await client().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    ...tuningForRole(role),
  });
  if (response.stop_reason === 'refusal') throw new Error('Model declined this request.');
  return firstTextBlock(response).trim();
}

module.exports = {
  isConfigured,
  completeJson,
  completeText,
  modelForRole: (role) => AnthropicModelForRole[role],
};
