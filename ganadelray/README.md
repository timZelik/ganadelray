# Gana's TikTok Agent

A daily idea drip for [@ganadelray](https://tiktok.com/@ganadelray). Each day it
sends ~3 fresh, specific, immediately-shootable video ideas — new angles on her
proven **follower-converting** topics, each visibly derived from one of her own
past winners.

Design rationale, resolved decisions, and the reasoning behind the odd-looking
choices live in [`CLAUDE.md`](./CLAUDE.md). This file is setup.

## Run the self-checks first (no accounts needed)

```bash
npm install
npm run selfcheck
```

This runs the whole build sequence against the fixture transcript with no
Supabase, no Telegram, and no API key:

- **step 2** — ingestion: 80 rows → 31 videos, per-window counts kept separate,
  relative dates resolved against the transcript's capture date
- **step 3** — the ranked converter table (printed for eyeballing), proving the
  bands workout (717 followers / 49K views) outranks the CalDiet ad (542
  followers / 4.9M views)
- **step 4** — enrichment: every video tagged, 10 spot-logged
- **step 5a** — generation guard rails against synthetic model output: off-lane
  ideas, ideas citing a source video that doesn't exist, vague ideas and rewords
  of already-sent ideas are all rejected, and a "bet" is never fabricated
- **steps 6–7** — statement-grammar copy, one-drip-per-day, pause, auto-stop
  after 3 unanswered, `gana_responded_at` stamping

Step 5 (idea generation) needs a model:

```bash
ANTHROPIC_API_KEY=sk-... npm run selfcheck:live
```

## Setup

```bash
cp .env.example .env   # then fill it in
```

| Variable | Where it comes from |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | @BotFather; chat id from any message's `chat.id` |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project settings → API |
| `WEBHOOK_SECRET` | any long random string — used for **both** the Telegram secret-token header and the `/internal/*` cron endpoints |

1. **Database** — paste [`db/schema.sql`](./db/schema.sql) into the Supabase SQL
   editor and run it. (Without `SUPABASE_URL` the app writes to a local JSON
   file instead, which is fine for development.)
2. **Deploy** — Vercel picks up `vercel.json` as-is. Set the same env vars there.
3. **Telegram webhook** —
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://<your-app>.vercel.app/telegram/webhook" \
     -d "secret_token=$WEBHOOK_SECRET"
   ```
   Verify the transport before wiring anything else: set `ECHO_MODE=1`, message
   the bot, and it echoes back.
4. **Cron** — add repo secrets `APP_URL` and `WEBHOOK_SECRET`. The hourly
   [daily-drip](./.github/workflows/daily-drip.yml) workflow pings the app; the
   app fires only inside the drip hour stored in `bot_state`. Also add
   `ANTHROPIC_API_KEY` for the [`/claude`](./.github/workflows/claude.yml)
   action so Tim can drive dev from his phone.

## Weekly loop

Tim runs Gana's TikTok Studio screenshots through Gemini and pastes the clean
text into the chat. There is **no vision parser** — that is a deliberate
decision, not a gap. Ingestion accepts pasted text:

```
## METRIC: NEW FOLLOWERS — window: 365 days
1. weights + bands will enhance these workouts but they are not necessary! t... | 717 | Posted on Jun 3, 2025
```

Or from the shell:

```bash
node scripts/ingest-file.js fixtures/sample-analytics-transcript.md
node scripts/run-drip.js          # manual drip, guard rails still apply
```

## What Gana can say

She dictates, so none of this needs exact wording:

| She says | What happens |
|---|---|
| "give me ideas" | 3 on-demand ideas off her converters |
| "would a renter-friendly kitchen one work" | closest real converters + how near a match ("unproven, not a no" when empty) |
| "idea: coffee table restock haul" | banked, re-dripped on a slow morning |
| "turn that into a series" | the next 3 parts of a proven winner |
| "write me the hook for the second one" | hooks + on-screen text (never editing advice) |
| "how did last week go" | top converters, followers first |
| "pause" / "resume" | drip off / back on |

## Endpoints

| Method | Path | Auth |
|---|---|---|
| `POST` | `/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` |
| `POST` | `/internal/drip[?force=1]` | `X-Webhook-Secret` |
| `POST` | `/internal/ingest` (text/plain body) | `X-Webhook-Secret` |
| `POST` | `/internal/ingest-reminder` | `X-Webhook-Secret` |
| `GET` | `/health` | none |
