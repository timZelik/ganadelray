# CLAUDE.md — Gana's TikTok Agent

Working notes for anyone (human or Claude) editing this repo. Read this before
changing behaviour; several decisions here look arbitrary and are not.

## What this is, in one sentence

**A daily idea drip: each day the bot sends Gana (@ganadelray) ~3 fresh, specific,
immediately-shootable video ideas — new angles on her proven follower-converting
topics, each visibly derived from one of her own past winners.**

The analytics archive is the *fuel*. Idea generation is the product. Everything
else is support. This is tool #1 of an intended larger toolbox — don't build
anything that blocks tools #2..n.

## The five facts that drive every design decision

1. **Her bottleneck is idea origination, not analytics.** Deciding what to make
   takes her the longest. She already knows apartment/moving converts — she needs
   a *supply* of fresh angles in that lane, not to be told what her lane is.
2. **Never touch editing.** She likes editing and does it anywhere. Upstream help
   (pre-written hooks, on-screen text) is welcome; the edit itself is her flow.
3. **Her pain is time-ROI, not low views.** A video she spent a lot of time on
   that underperforms is what hurts; a quick flop costs nothing. So: make
   origination near-instant and de-risk before she commits.
4. **Reach and follower-conversion are DECOUPLED.** This is the core data insight.

   | Video | Reach (365d) | New followers (365d) |
   |---|---|---|
   | CalDiet ad | 4.9M | 542 |
   | "weights + bands" workout | 49K | **717** |
   | "things to do before moving in" | 309K | 633 |
   | Cleaning humour | 1.7M | 294 |

   Apartment/home/moving/fitness **convert**. Viral-reach content inflates views
   and grows the account barely. **Rank on followers, always.**
5. **Series convert.** Multi-part content recurs in her follower rankings —
   people follow for the next part. A repeatable, mechanical follower lever.

## Resolved decisions — do not re-litigate

| Decision | Resolution |
|---|---|
| North-star metric | New followers per video (TikTok Studio → Content → "Your top posts" → New followers). |
| Ranking key | Follower **volume**, not rate. Rate is only the *explainer* ("converts 132× better than the diet ad"). |
| Intake | **Not an engineering problem. No vision parser.** Tim runs screenshots through Gemini → clean text → pastes it. We ingest text. If two rows are genuinely ambiguous, the bot asks — no over-engineered matching. |
| Cadence | Ideas **daily**. Analytics ingest **weekly** (attribution keeps moving; the 28-day window re-scores maturing videos). Chat on demand. |
| Scheduling | **External cron (GitHub Actions)** → `/internal/drip`. Not Vercel Hobby cron (once-daily min, ±59min imprecise). |
| Model routing | Haiku = intent. Sonnet = idea generation + skill execution. Opus = rare deep synthesis (pattern surfacing). |

## Communication design (as important as the code)

- **Statements, not questions.** Every proactive message is something she can
  ignore. Not "What do you want to make today?" (homework) but "Your bands
  workout pulled 717 — here's the ab-routine version 👇".
- **Silence is data, not failure.** Never treat a non-reply as an error; never
  nag. After 3 unanswered drips the bot stops pushing and stays available.
- **Assume voice-transcript mess.** She dictates. The input path must extract
  structure from rambly, unpunctuated speech, not expect clean commands.
- **Every performance line leads with the follower number, never views**, and a
  low-view/high-follower video is stated as a WIN. Her instinct undervalues
  exactly the content that grows her account. This is copy, and it matters as
  much as any function.

## Architecture

```
Telegram ─┐                                   ┌─ ideaGenerator (the heart)
GH Actions├─► index.js ─► skillRouter ────────┼─ confidenceCheck (inverse mode)
cron     ─┘      │        ▲                   ├─ ideaBank (inbound capture)
                 │        │                   ├─ seriesExpansion
                 │   intentClassifier (Haiku)  ├─ hookWriter
                 │                            └─ patternSurfacer (Opus, rare)
                 └─► dripScheduler ─► guard rails + timing
                                          │
   analyticsIngestor ─► converterArchive ─┘        (all reads via supabaseClient)
```

### Boundary rule (enforced by convention, easy to check)
- **All Anthropic calls** → `src/utils/claudeClient.js`
- **All database access** → `src/db/supabaseClient.js`
- **All Telegram calls** → `src/telegram/telegramClient.js`
- **All magic values** → `src/utils/constants.js`

Nothing else may import an SDK or hardcode a model name, tag, or threshold.

### Why ranking is in JS, not SQL
Single creator, hundreds of rows. Keeping the business rules (rank on followers,
recency weighting, conversion gap) in one readable file beats splitting them
across queries — and it makes them testable offline.

### Why the DB has a local-file backend
`supabaseClient` falls back to a JSON file when `SUPABASE_URL` is unset. That is
what makes `npm run selfcheck` runnable with no cloud account, no network, and no
API key — steps 2, 3, 4, 6 and 7 all verify offline.

## Data model notes

- **Identity = normalized caption prefix + resolved posted date.** Screenshots
  give truncated captions and relative dates ("2w ago"), which resolve against
  the transcript's *capture* date, never against `now`. The longest caption
  prefix ever seen is stored as the anchor.
- **Per-window follower counts are separate observations, not overwrites.** A
  video's 7/28/60/365-day numbers are different facts about the same video.
- `drip_sent_at` / `gana_responded_at` are written on every send **from day one**.

## Deferred, and why

| Deferred | Why | What already exists |
|---|---|---|
| Adaptive timing learner | Needs weeks of her real engagement behaviour. | `drip_log.drip_sent_at`, `gana_responded_at`, `response_lag_minutes`, and `bot_state.drip_hour_local` (read at send time, never a constant). Ingesting analytics already moves the hour to her observed audience peak. |
| Idea-quality tuning from accept/reject history | Needs a taste corpus. | `idea_log.status` + `verdict_note` capture every accept/reject now. |
| Streak-aware encouragement | Needs a performance-trend baseline. | Weekly observations accumulate toward it. |

Do not fake tuning against data that does not exist yet.

## Model IDs

`constants.js` ships current model IDs (`claude-haiku-4-5`, `claude-sonnet-5`,
`claude-opus-5`). The build brief's companion file named `claude-sonnet-4-6` /
`claude-opus-4-6`; those are older releases, and the role split (Haiku → intent,
Sonnet → generation, Opus → synthesis) is unchanged. Change IDs in
`AnthropicModelForRole` only — nowhere else names a model.

## Open questions for Gana

Ask only if genuinely blocked; sane defaults are in place.

1. Drip timezone + preferred time. **Default: 7pm America/New_York**, taken from
   her active-hours data. Confirm the timezone is ET.
2. Trending-sound ideas, or purely format/topic angles? **Default: format/topic.**
   Sounds are a later layer.
3. Any topics she's burned out on and wants excluded even if they convert?
   (No exclusion list exists yet; it would go in `constants.js`.)
