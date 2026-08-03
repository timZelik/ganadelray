// src/telegram/copy.js
//
// Copy is not decoration here — it is half the product.
//
// GRAMMAR: statements, never questions. Every proactive message must be
// something Gana can ignore without owing anyone an answer. "Your bands workout
// pulled 717 — here's the ab-routine version" is a statement. "What do you want
// to make today?" is homework.
//
// EMOTIONAL UX: every performance line leads with the FOLLOWER number, never
// views, and a low-view/high-follower video is stated as a win. Her instinct
// undervalues exactly the content that grows her account; if the copy leads
// with views she will kill her best format chasing reach.

const { formatCount } = require('../utils/text');
const { DataFreshness } = require('../utils/constants');

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function shortCaption(caption, length = 46) {
  const text = String(caption || '').trim();
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}

/** "717 followers" — always followers first. Views only ever appear after. */
function followerLine(followers, views) {
  const base = `${formatCount(followers)} followers`;
  if (!views) return base;
  return `${base} on ${formatCount(views)} views`;
}

function ideaBlock(idea, index) {
  const lines = [];
  const label = idea.isBet ? `${index}. 🎲 <b>BET</b> — untested angle` : `${index}.`;
  lines.push(`${label} ${escapeHtml(idea.concept)}`);
  if (idea.hook) lines.push(`   hook: “${escapeHtml(idea.hook)}”`);
  if (idea.onscreenText) lines.push(`   on-screen: ${escapeHtml(idea.onscreenText)}`);
  if (idea.sourceCaption) {
    lines.push(`   ↳ from “${escapeHtml(shortCaption(idea.sourceCaption))}” — <b>${formatCount(idea.sourceFollowers)} followers</b>`);
  }
  if (idea.whyItConverts) lines.push(`   why: ${escapeHtml(idea.whyItConverts)}`);
  return lines.join('\n');
}

/** The daily drip. Statement, follower-led, ignorable. */
function formatDripMessage(ideas, options = {}) {
  const first = ideas[0];
  const lead = options.lead
    || (first && first.sourceCaption
      ? `Your “${shortCaption(first.sourceCaption, 34)}” pulled <b>${formatCount(first.sourceFollowers)} followers</b>.`
      : 'Three angles off your own converters.');

  const parts = [];
  if (options.staleDays && options.staleDays > DataFreshness.STALE_AFTER_DAYS) {
    parts.push(`<i>Working off analytics from ${options.staleDays} days ago.</i>`);
  }
  parts.push(`${lead} Three angles off your winners 👇`);
  parts.push(ideas.map((idea, index) => ideaBlock(idea, index + 1)).join('\n\n'));
  if (options.patternLine) parts.push(`📌 ${escapeHtml(options.patternLine)}`);
  return parts.join('\n\n');
}

/** Idea bank re-drip on a slow morning. Her idea, handed back. */
function formatRedrip(banked, idea) {
  const parts = [
    `You banked this one: “${escapeHtml(shortCaption(banked.cleaned_text, 90))}”`,
  ];
  if (idea) parts.push(ideaBlock({ ...idea, isBet: false }, 1));
  return parts.join('\n\n');
}

/**
 * Inverse mode. NEVER predicts virality — reports how near a match her idea is
 * to things that already converted, and says "unproven, not a no" when empty.
 */
function formatConfidenceCheck(pitch, analogues) {
  if (!analogues || analogues.length === 0) {
    return [
      `Nothing in your archive looks much like that one.`,
      `That makes it <b>unproven, not a no</b>. Worth a cheap, fast version — low time at stake.`,
    ].join('\n\n');
  }
  const top = analogues[0];
  const near = top.matchScore > 0.35 ? 'close match' : 'loose match';
  const lines = [
    `Closest things you've already done (${near}):`,
    analogues.map((video, index) => {
      const label = `${index + 1}. “${escapeHtml(shortCaption(video.caption))}”`;
      // Followers first, always — and when there is no follower reading yet, say
      // that plainly instead of implying a zero.
      if (video.newFollowers === null || video.newFollowers === undefined) {
        return `${label} — no follower data on it yet`;
      }
      const window = video.windowDays && video.windowDays !== 365 ? ` in ${video.windowDays}d` : '';
      return `${label} — <b>${formatCount(video.newFollowers)} followers</b>${window}${video.views ? ` on ${formatCount(video.views)} views` : ''}`;
    }).join('\n'),
  ];
  if (top.followersPer1K) {
    lines.push(`Your version of this format converts at ${top.followersPer1K.toFixed(1)} followers per 1K views.`);
  }
  if (analogues.every((video) => video.newFollowers === null || video.newFollowers === undefined)) {
    lines.push('No conversion numbers on any of those yet, so this is <b>unproven, not a no</b>.');
  }
  return lines.join('\n\n');
}

/** Weekly performance. Followers first, every time. */
function formatPerformanceReview(ranked, options = {}) {
  if (ranked.length === 0) return 'No analytics in the archive yet.';
  const lines = ranked.slice(0, 5).map((video, index) => (
    `${index + 1}. <b>${formatCount(video.newFollowers)} followers</b> — “${escapeHtml(shortCaption(video.caption))}”${video.views ? ` <i>(${formatCount(video.views)} views)</i>` : ''}`
  ));
  const parts = [`Your top converters, last ${options.windowDays || 365} days:`, lines.join('\n')];

  const sleeper = ranked.find((video) => video.views && video.views < 100_000 && video.newFollowers >= 200);
  if (sleeper) {
    parts.push(`Worth saying out loud: “${escapeHtml(shortCaption(sleeper.caption, 34))}” did <b>${formatCount(sleeper.newFollowers)} followers</b> on only ${formatCount(sleeper.views)} views. Small reach, big conversion — that's a win.`);
  }
  return parts.join('\n\n');
}

function formatSeriesOffer(source, parts) {
  const lines = [
    `“${escapeHtml(shortCaption(source.caption, 40))}” pulled <b>${formatCount(source.newFollowers)} followers</b>. Series convert for you — people follow for the next part.`,
    `The rest of it:`,
    parts.map((part, index) => `${index + 2}. ${escapeHtml(part.concept)}${part.hook ? `\n   hook: “${escapeHtml(part.hook)}”` : ''}`).join('\n'),
    `That's a week of content off one video.`,
  ];
  return lines.join('\n\n');
}

function formatHooks(idea, hooks) {
  return [
    `Hooks for: ${escapeHtml(idea.concept || idea)}`,
    hooks.map((hook, index) => `${index + 1}. “${escapeHtml(hook.hook)}”\n   on-screen: ${escapeHtml(hook.onscreenText)}`).join('\n\n'),
  ].join('\n\n');
}

function formatBankAck(entry) {
  const matched = entry.match_note ? ` Closest converter you've made: ${escapeHtml(entry.match_note)}.` : '';
  return `Banked.${matched} It'll come back on a slow morning.`;
}

const formatPaused = () => 'Paused. No more daily ideas until you say resume.';
const formatResumed = () => 'Back on. Ideas land around 7pm.';
const formatIdeaAccepted = () => 'Logged. Good one.';
const formatIdeaRejected = () => 'Noted — that\'s useful, it tunes what you get next.';

module.exports = {
  escapeHtml,
  shortCaption,
  followerLine,
  ideaBlock,
  formatDripMessage,
  formatRedrip,
  formatConfidenceCheck,
  formatPerformanceReview,
  formatSeriesOffer,
  formatHooks,
  formatBankAck,
  formatPaused,
  formatResumed,
  formatIdeaAccepted,
  formatIdeaRejected,
};
