// src/telegram/telegramClient.js
//
// THE ONLY FILE THAT TOUCHES TELEGRAF.
//
// Outbound is deliberately thin: one sendMessage wrapper. Everything about
// *what* to say lives in copy.js; everything about *when* lives in
// dripScheduler.js.

const { makeLogger } = require('../utils/logger');

const log = makeLogger('telegram');

let telegram = null;

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function api() {
  if (!telegram) {
    const { Telegram } = require('telegraf');
    telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN);
  }
  return telegram;
}

/**
 * Sends to Gana's chat. Dry-runs (logs, does not send) when unconfigured, so
 * local runs of the drip exercise the whole pipeline without a bot token.
 */
async function sendMessage(text, options = {}) {
  const chatId = options.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!isConfigured() && !options.chatId) {
    log.warn('not configured — dry run', { chars: text.length });
    console.log(`\n--- would send to Telegram ---\n${text}\n-----------------------------\n`);
    return { dryRun: true, text };
  }
  const message = await api().sendMessage(chatId, text, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...options.extra,
  });
  log.info('sent', { messageId: message.message_id, chars: text.length });
  return message;
}

/** Telegram hard-caps messages at 4096 chars. Split on blank lines, never mid-idea. */
async function sendChunked(text, options = {}) {
  const LIMIT = 3800;
  if (text.length <= LIMIT) return [await sendMessage(text, options)];

  const blocks = text.split('\n\n');
  const chunks = [];
  let current = '';
  for (const block of blocks) {
    if ((`${current}\n\n${block}`).length > LIMIT && current) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) chunks.push(current);

  const sent = [];
  for (const chunk of chunks) sent.push(await sendMessage(chunk, options));
  return sent;
}

/** Registers the webhook with Telegram, including the secret-token header. */
async function setWebhook(url) {
  return api().setWebhook(url, {
    secret_token: process.env.WEBHOOK_SECRET,
    allowed_updates: ['message', 'edited_message'],
  });
}

module.exports = { isConfigured, sendMessage, sendChunked, setWebhook };
