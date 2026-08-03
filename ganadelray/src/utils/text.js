// src/utils/text.js
//
// Caption normalization is load-bearing: it IS the video identity key. Screenshot
// captions are truncated ("...") and re-transcribed slightly differently each
// week, so identity has to survive casing, emoji, and trailing ellipsis.
//
// Also home to voice-transcript cleanup — Gana dictates, she does not type.

const { IngestConfig } = require('./constants');

const EMOJI = /[\p{Extended_Pictographic}️‍\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * Lowercase, drop emoji, drop the truncation ellipsis, collapse whitespace.
 * Hashtags are KEPT — they carry topic signal and are part of the caption.
 */
function normalizeCaption(raw) {
  return String(raw || '')
    .replace(EMOJI, ' ')
    .replace(/\.{2,}\s*$/, '')        // trailing "..." from the screenshot cut
    .replace(/[‘’]/g, "'")  // smart quotes -> straight
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The identity anchor: a bounded prefix of the normalized caption. */
function captionKey(normalized) {
  return String(normalized || '').slice(0, IngestConfig.CAPTION_KEY_LENGTH).trim();
}

/** True when two keys plausibly name the same video (one truncated further). */
function keysOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < IngestConfig.MIN_CAPTION_KEY_LENGTH) return false;
  return longer.startsWith(shorter);
}

/** "4.9M" | "1.7K" | "14,000" | "717" -> Number */
function parseCount(raw) {
  const text = String(raw || '').trim().replace(/,/g, '');
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([KkMm])?$/);
  if (!match) return null;
  const value = Number(match[1]);
  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k') return Math.round(value * 1_000);
  if (suffix === 'm') return Math.round(value * 1_000_000);
  return Math.round(value);
}

/** 717 -> "717"; 49000 -> "49K"; 4900000 -> "4.9M" — for copy. */
function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}K`;
  return String(n);
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'with', 'your',
  'you', 'my', 'i', 'it', 'is', 'are', 'that', 'this', 'how', 'do', 'me', 'at',
]);

function tokens(text) {
  return normalizeCaption(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Dice coefficient over content words. Used to dedupe ideas against sent ones. */
function similarity(a, b) {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return (2 * shared) / (setA.size + setB.size);
}

/**
 * Gana dictates into the iPhone mic. Expect rambly, unpunctuated,
 * stream-of-consciousness input with filler. Strip the filler, keep the idea.
 * This is a light touch on purpose — Haiku does the real interpretation.
 */
function cleanVoiceTranscript(raw) {
  return String(raw || '')
    .replace(/\b(um+|uh+|like i mean|you know|i guess|kind of like)\b/gi, ' ')
    .replace(/\s+([,.!?])/g, '$1')     // filler removal leaves orphaned punctuation
    .replace(/([,;])\s*(?=[,;])/g, '') // ...and doubled-up commas
    .replace(/^[\s,;.]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable short hash — idea dedupe keys, not security. */
function shortHash(text) {
  let hash = 5381;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

module.exports = {
  normalizeCaption,
  captionKey,
  keysOverlap,
  parseCount,
  formatCount,
  similarity,
  cleanVoiceTranscript,
  shortHash,
  tokens,
};
