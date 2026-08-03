// src/utils/dates.js
//
// Screenshot analytics give MIXED date formats, and half of them are relative
// ("2w ago"). Every relative date must be resolved against the capture date of
// the transcript, not against "now" — a transcript pasted three days late would
// otherwise slide every video three days younger.
//
// Deliberately dependency-free: the ingest path must be runnable and testable
// without installing anything.

const { DatePrecision } = require('./constants');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const RELATIVE_UNIT_DAYS = {
  d: 1, day: 1, days: 1,
  w: 7, week: 7, weeks: 7,
  mo: 30, month: 30, months: 30,
  y: 365, year: 365, years: 365,
};

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function toISODate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/**
 * "Posted on Jun 3, 2025" | "Posted on Jun 9" | "2w ago" | "1mo ago" | "6d ago"
 * -> { date, precision, raw }
 *
 * capturedAt anchors both the relative offsets and the missing-year inference.
 */
function parsePostedDate(raw, capturedAt) {
  const text = String(raw || '').trim();
  const anchor = capturedAt instanceof Date ? capturedAt : new Date();
  if (!text) return { date: null, precision: DatePrecision.UNKNOWN, raw: text };

  // Relative: "2w ago", "6d ago", "1mo ago", "3 weeks ago"
  const relative = text.match(/^(\d+)\s*(d|w|mo|y|days?|weeks?|months?|years?)\s*ago$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unitDays = RELATIVE_UNIT_DAYS[relative[2].toLowerCase()];
    return {
      date: addDays(anchor, -(amount * unitDays)),
      precision: DatePrecision.APPROXIMATE,
      raw: text,
    };
  }

  // Absolute: "Posted on Jun 3, 2025" / "Jun 3, 2025" / "Posted on Jun 9"
  const absolute = text
    .replace(/^posted\s+on\s+/i, '')
    .match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*,\s*(\d{4}))?$/);
  if (absolute) {
    const monthIndex = MONTHS[absolute[1].slice(0, 3).toLowerCase()];
    const day = Number(absolute[2]);
    if (monthIndex === undefined || !day) {
      return { date: null, precision: DatePrecision.UNKNOWN, raw: text };
    }
    if (absolute[3]) {
      return {
        date: utcDate(Number(absolute[3]), monthIndex, day),
        precision: DatePrecision.EXACT,
        raw: text,
      };
    }
    // No year given: TikTok omits it for the current year window. Pick the most
    // recent occurrence that is not in the future relative to capture.
    let year = anchor.getUTCFullYear();
    let candidate = utcDate(year, monthIndex, day);
    if (candidate.getTime() > anchor.getTime()) {
      year -= 1;
      candidate = utcDate(year, monthIndex, day);
    }
    return { date: candidate, precision: DatePrecision.MONTH_DAY, raw: text };
  }

  const iso = text.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return { date: new Date(`${text}T00:00:00Z`), precision: DatePrecision.EXACT, raw: text };

  return { date: null, precision: DatePrecision.UNKNOWN, raw: text };
}

/**
 * Two dates refer to the same video when at least one side was resolved from a
 * coarse relative string. Exact-vs-exact must match to the day.
 */
function datesCompatible(a, b, toleranceDays) {
  if (!a.date || !b.date) return true; // unknown date never blocks a caption match
  const gap = Math.abs(daysBetween(a.date, b.date));
  const bothExact = a.precision === DatePrecision.EXACT && b.precision === DatePrecision.EXACT;
  return bothExact ? gap === 0 : gap <= toleranceDays;
}

// Higher wins when merging two observations of the same video.
const PRECISION_RANK = {
  [DatePrecision.EXACT]: 3,
  [DatePrecision.MONTH_DAY]: 2,
  [DatePrecision.APPROXIMATE]: 1,
  [DatePrecision.UNKNOWN]: 0,
};

function betterDate(current, incoming) {
  if (!current || !current.date) return incoming;
  if (!incoming || !incoming.date) return current;
  return PRECISION_RANK[incoming.precision] > PRECISION_RANK[current.precision] ? incoming : current;
}

/** Current local hour in an IANA timezone, without pulling in a tz library. */
function localHour(timeZone, at = new Date()) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).format(at);
  return Number(hour) % 24;
}

/** YYYY-MM-DD in an IANA timezone — the key for "one drip per day". */
function localDateKey(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return parts;
}

module.exports = {
  MS_PER_DAY,
  toISODate,
  addDays,
  daysBetween,
  parsePostedDate,
  datesCompatible,
  betterDate,
  localHour,
  localDateKey,
};
