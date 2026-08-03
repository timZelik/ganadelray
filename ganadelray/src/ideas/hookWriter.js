// src/ideas/hookWriter.js
//
// Pre-written hooks and on-screen text for an idea she picked. This is UPSTREAM
// of editing, which is welcome — it speeds her edit without touching it. The
// edit itself is her flow and this system never goes near it.

const claude = require('../utils/claudeClient');
const db = require('../db/supabaseClient');
const copy = require('../telegram/copy');
const prompts = require('./prompts');
const { similarity } = require('../utils/text');

/** Resolve "write hooks for the ab routine one" against the ideas recently sent. */
async function resolveIdea(hintText) {
  const recent = await db.getRecentIdeas(30);
  if (recent.length === 0) return null;
  const scored = recent
    .map((idea) => ({ idea, score: similarity(hintText || '', `${idea.concept} ${idea.hook || ''}`) }))
    .sort((a, b) => b.score - a.score)[0];
  return scored && scored.score > 0.15 ? scored.idea : recent[0];
}

async function writeHooks({ hintText = null, count = 3 } = {}) {
  const idea = await resolveIdea(hintText);
  const subject = idea ? idea.concept : hintText;
  if (!subject) return null;

  const result = await claude.completeJson({
    role: 'SKILL_EXECUTION',
    system: prompts.HOOKS_SYSTEM,
    user: [
      `IDEA: ${subject}`,
      idea && idea.source_caption
        ? `It came from her winner "${idea.source_caption}" (${idea.source_followers} followers).`
        : null,
      `Write ${count} hook options.`,
    ].filter(Boolean).join('\n\n'),
    schema: prompts.HOOKS_SCHEMA,
    maxTokens: 2000,
  });

  const hooks = (result.hooks || []).map((hook) => ({
    hook: hook.hook,
    onscreenText: hook.onscreen_text,
    hookStyle: hook.hook_style,
  }));

  return { idea, hooks, message: copy.formatHooks({ concept: subject }, hooks) };
}

module.exports = { writeHooks };
