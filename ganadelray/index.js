// index.js
//
// Express server + Telegram webhook entry point.
//
// Two kinds of inbound traffic:
//   POST /telegram/webhook  — Gana talking, verified by Telegram's secret-token header
//   POST /internal/*        — the external GitHub Actions cron, verified by the same secret
//
// Scheduling deliberately lives OUTSIDE this app (GitHub Actions), because
// Vercel Hobby cron is once-daily minimum and +/-59min imprecise — it cannot
// land on her 7pm audience peak.

require('dotenv').config();

const express = require('express');
const { makeLogger } = require('./src/utils/logger');
const db = require('./src/db/supabaseClient');
const claude = require('./src/utils/claudeClient');
const telegram = require('./src/telegram/telegramClient');
const { classifyIntent } = require('./src/router/intentClassifier');
const { handleMessage } = require('./src/router/skillRouter');
const scheduler = require('./src/schedule/dripScheduler');
const { ingestTranscript } = require('./src/ingest/analyticsIngestor');
const { enrichArchive } = require('./src/enrich/videoClassifier');

const log = makeLogger('server');
const app = express();

app.use(express.json({ limit: '2mb' }));      // pasted analytics transcripts are chunky
app.use(express.text({ limit: '2mb', type: 'text/plain' }));

function secretOk(req) {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return false;
  const header = req.get('X-Telegram-Bot-Api-Secret-Token')
    || req.get('X-Webhook-Secret')
    || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return header === expected;
}

function extractText(update) {
  const message = update.message || update.edited_message || update.channel_post;
  if (!message) return { text: null, chatId: null, kind: 'none' };
  const chatId = message.chat && message.chat.id;
  if (message.text) return { text: message.text, chatId, kind: 'text' };
  if (message.caption) return { text: message.caption, chatId, kind: 'caption' };
  if (message.voice || message.audio) return { text: null, chatId, kind: 'voice' };
  return { text: null, chatId, kind: 'other' };
}

// ---------------------------------------------------------------------------
// Telegram webhook
// ---------------------------------------------------------------------------
app.post('/telegram/webhook', async (req, res) => {
  if (!secretOk(req)) {
    log.warn('webhook rejected: bad secret');
    return res.status(401).json({ ok: false });
  }

  const { text, chatId, kind } = extractText(req.body || {});
  log.info('inbound', { kind, chars: text ? text.length : 0 });

  // Step-0 smoke test: ECHO_MODE=1 makes the webhook echo, so the transport can
  // be verified before any model or database is wired up.
  if (process.env.ECHO_MODE === '1') {
    if (text) await telegram.sendMessage(`echo: ${text}`, { chatId });
    return res.json({ ok: true, echoed: Boolean(text) });
  }

  if (kind === 'voice') {
    await telegram.sendMessage(
      'Voice files aren\'t wired up yet — dictate straight into the message box with the mic key and it lands here as text.',
      { chatId },
    );
    return res.json({ ok: true });
  }
  if (!text) return res.json({ ok: true, ignored: true });

  try {
    const intent = await classifyIntent(text);
    const reply = await handleMessage(text, intent);
    if (reply) await telegram.sendChunked(reply, { chatId });
  } catch (error) {
    log.error('webhook handling failed', { message: error.message });
    await telegram.sendMessage('That one broke on my side. Nothing lost.', { chatId });
  }
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// External cron (GitHub Actions)
// ---------------------------------------------------------------------------

/** Hourly ping. Fires only inside her stored drip hour unless force=1. */
app.post('/internal/drip', async (req, res) => {
  if (!secretOk(req)) return res.status(401).json({ ok: false });
  try {
    const result = await scheduler.runDailyDrip({ force: req.query.force === '1' });
    return res.json({ ok: true, ...result, ideas: result.ideas ? result.ideas.length : 0 });
  } catch (error) {
    log.error('drip failed', { message: error.message });
    return res.status(500).json({ ok: false, error: error.message });
  }
});

/** Weekly nudge: analytics ingest is weekly, not daily — attribution keeps moving. */
app.post('/internal/ingest-reminder', async (req, res) => {
  if (!secretOk(req)) return res.status(401).json({ ok: false });
  const state = await db.getBotState();
  if (state.paused) return res.json({ ok: true, sent: false, reason: 'paused' });
  const age = await scheduler.dataAgeDays();
  await telegram.sendMessage(
    age === null
      ? 'No analytics in the archive yet — paste a screenshot transcript whenever you have one.'
      : `Analytics are ${age} days old. New paste whenever you get a minute — the 28-day window re-scores everything that's still maturing.`,
  );
  return res.json({ ok: true, sent: true, age });
});

/** Direct ingest, for Tim: POST the Gemini-transcribed text as text/plain. */
app.post('/internal/ingest', async (req, res) => {
  if (!secretOk(req)) return res.status(401).json({ ok: false });
  const text = typeof req.body === 'string' ? req.body : (req.body && req.body.text);
  if (!text) return res.status(400).json({ ok: false, error: 'no text' });
  try {
    const summary = await ingestTranscript(text);
    const enriched = await enrichArchive();
    return res.json({ ok: true, ...summary, classified: enriched.classified });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    db: db.backend,
    anthropic: claude.isConfigured(),
    telegram: telegram.isConfigured(),
    echoMode: process.env.ECHO_MODE === '1',
  });
});

app.get('/', (_req, res) => res.type('text').send("gana's idea drip — up"));

const port = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(port, () => log.info('listening', { port, db: db.backend }));
}

module.exports = app;
