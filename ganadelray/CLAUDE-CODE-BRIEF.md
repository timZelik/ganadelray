# BUILD BRIEF — Gana's TikTok Agent (v1, one-shot)

**For:** Claude Code (Opus). **Do not use plan mode.** This brief IS the plan. Execute the build sequence below end-to-end in one pass. After each numbered step, run its self-check, and if it passes, **continue without waiting** — do not stop for approval between steps.

**Assume a BARE repo.** There is no prior scaffolding to reconcile against — build everything from empty. Three companion files are provided alongside this brief: `constants.js` (drop into `src/utils/`), `sample-analytics-transcript.md` (the ingestion test fixture), and `BUILD-PLAN.md` (background context — this brief supersedes it wherever they differ). If any of those files are missing, proceed anyway from this brief alone.

**Step 0 — Bootstrap the skeleton before anything else:**
- `package.json` with deps: `express`, `telegraf` (4.16.3), `@anthropic-ai/sdk`, `@supabase/supabase-js`, `zod`, `papaparse`, `dotenv`, `date-fns`.
- `index.js` — Express server + Telegram webhook entry point, verifies `WEBHOOK_SECRET`.
- Three boundary clients: `src/utils/claudeClient.js` (Anthropic SDK wrapper, model routing), `src/db/supabaseClient.js` (single client, all DB ops), `src/telegram/telegramClient.js` (sendMessage wrapper). **Nothing else may touch an SDK directly.**
- `src/utils/constants.js` from the provided file.
- `.env.example` with: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `WEBHOOK_SECRET`.
- `.github/workflows/claude.yml` — the Claude Code GitHub Action (`/claude <task>` on issues/PRs → opens a PR), so Tim can drive async dev from his phone.
- *Self-check:* `npm install` succeeds; webhook echoes a received Telegram message.

**What "one-shot" means here:** build the complete, deployable v1 — the core loop live and working. Two things (idea *quality* and adaptive *timing*) can only be tuned against Gana's real usage, which doesn't exist yet. Build them with sane defaults + stubs where noted and mark them deferred. Don't fake tuning you can't do.

---

## Product in one sentence

**A daily idea drip: each day, the bot sends Gana ~3 fresh, specific, immediately-shootable video ideas — new angles on her proven follower-converting topics, each visibly derived from one of her own past winners.** The analytics archive is the *fuel* for the ideas, not the product. Idea generation is primary; everything else is support.

---

## Who

Gana (@ganadelray). 9,323 followers. Full-time creator — **this is her income and her bet on herself.** Audience 81% female. Niche she already knows converts: apartment/home setup, moving, budget furniture, renter-friendly fixes, fitness/workouts, credit cards, tech/Amazon finds, food, lifestyle/dating-advice. This bot is **tool #1** of an intended larger toolbox — don't architect anything in a way that blocks tools #2..n.

## What we know about Gana — these DRIVE the design

1. **Her bottleneck is idea origination, not analytics.** Her own words: deciding what to make takes the longest and is where she needs the most help. She already *knows* apartment/moving converts — she needs a *supply* of fresh ideas in that lane, not to be told what her lane is.
2. **Editing she likes and does anywhere (car, etc.). DO NOT build anything that touches or replaces editing.** Upstream-of-editing help (pre-written hooks / on-screen text) is welcome; the edit itself is her flow.
3. **Her pain is time-ROI, not low views.** She gets discouraged when a video she spent *a lot of time on* underperforms; a quick video that flops doesn't hurt. So: make origination near-instant (less time at stake) and de-risk before she commits.
4. **Reach and follower-conversion are DECOUPLED — the core data insight.** Her view-winners are not her follower-winners:
   - CalDiet ad: 4.9M new viewers → **542** followers (365d)
   - "weights + bands" workout: 49K viewers → **717** followers (365d) — 100× less reach, *more* followers
   - "things to do before moving in": 309K viewers → **633** followers (365d)
   - Cleaning humor: 1.7M viewers → **294** followers (365d)
   Apartment/home/moving/fitness **convert**; viral-reach content (diet ads, cleaning, relatable humor) inflates views and grows the account barely. **Rank on followers, always.**
5. **Series convert.** Multi-part content ("apartment hacks part 1/2", "Shera Seven part 3/5") recurs in her follower rankings — people follow for the next part. A repeatable, mechanical follower lever.

---

## RESOLVED decisions — do not re-litigate

| Decision | Resolution |
|---|---|
| North-star metric | **New followers per video.** Exists in TikTok Studio → Content → "Your top posts" → **New followers** tab, per window (7/28/60/365d). |
| Ranking key | Follower **volume**, not rate. Rate is only the *explainer* ("converts 15× better than her diet content"). |
| Intake | **NOT an engineering problem. Build no vision parser.** Tim runs Gana's analytics screenshots through Gemini → clean text → pastes it. You ingest already-transcribed **text**. Single-user, weekly, paste-in. If two rows are genuinely ambiguous, the bot asks Gana — don't over-engineer matching. |
| Cadence | Ideas **daily**. Analytics ingest **weekly** (follower attribution keeps moving for days; a 28-day window re-scores maturing videos). Chat **on-demand**. |
| Scheduling | **External cron (GitHub Actions)** hitting the existing Vercel webhook — NOT Vercel Hobby cron (once-daily min, ±59min imprecise). |

---

## THE hard problem worth your effort: idea specificity

A daily drip lives or dies on this. Generic ideas ("make an apartment organization video!") get the bot muted by day 3. Every idea MUST be:
- **Shootable without further thinking** — concrete enough to pick up the phone and film.
- **Visibly derived from a real win** — cite the source video + its follower count so she trusts it: *"Your resistance-bands workout pulled 717 followers — here's the same no-equipment format for a small-apartment ab routine."*
- **Inside her proven lane** — apartment/moving/budget-home/fitness, not off-brand virality.

Spend your effort here. Keep everything else barebones. This is the one genuinely Gana-specific hard problem.

---

## Communication design — how and when it talks (equal in importance to the code)

**Grammar: statements, not questions.** Gana has no time for questions; she likes statements and the occasional clarification. Every proactive message is a **statement she can ignore**. Not "What do you want to make today?" (homework) but "Your bands workout pulled 717 — here's the ab-routine version 👇". **Silence is data, not failure** — never treat a non-reply as an error or nag her for an answer. Optional clarifications only, and only when genuinely blocked.

**Input: assume voice-transcript mess.** She'll dictate (iPhone keyboard mic) rambly, stream-of-consciousness thoughts she'd never type. The input parser must extract structure from messy voice transcripts, not expect clean typed commands. Treat her input the way a good assistant treats a hurried voice memo.

**Timing: earn it from data, don't hardcode blindly.** Her active-hours data already exists (followers most active ~7pm per her analytics). **v1:** fire the daily drip once near her audience peak (default 7pm her local TZ — confirm TZ; likely ET). **But store `drip_sent_at` and `gana_responded_at` on every send from day one**, so a later job can learn her real engagement offset and shift the send time. Build the columns and the hook now; **do not build the learning loop yet** (no data to learn from). This is the concrete version of "adaptive, not rigid": timing is a value the system will *learn*, stored in a column, not a constant baked into code.

---

## The core engine

### 1. Idea generation loop (primary feature)
```
daily external cron
  → pull top follower-converters from archive (weight recent × high-follower)
  → rotate through her converter PATTERNS {format_tag, hook_style, topic_tag}
  → Sonnet generates ~3 fresh angles, each carrying:
       • one concrete, shootable concept
       • the source winner + its follower count
       • one plain-language line on why it should convert
  → dedupe against ideas already sent (persist sent ideas)
  → ~1 in 5 is an explicit BET: an untested angle, labeled as such (anti-lock-in)
  → send as statements (drip)
```

### 2. Confidence-check (inverse mode)
Gana pitches her own idea → same engine backwards → bot returns closest converters and how near a match it is. **Never predicts virality.** Empty match = "unproven, not a no."

### 3. Idea bank (inbound, same engine)
She fires a voice note *the instant an idea hits* (car, editing, shower). Bot tags it against her converters and **re-drips it back on a slow morning when she's stuck.** Ideas are lottery tickets that arrive at random — this catches them. Same engine run inbound; near-zero extra cost.

### 4. Series expansion (highest-leverage origination multiplier)
When a source winner was a "part 1" — or any strong converter — proactively offer to turn it into a multi-part series (the other 3 parts, concretely). **One idea becomes a week of content**, directly attacking the origination bottleneck. Series are proven converters for her.

---

## Feature tiers — build v1 core fully; stub the rest

**v1 CORE (build and ship, must work):**
- Text ingestion of pasted analytics → ranked converter archive
- Enrichment (tag classification) from real topics
- Idea generation loop (daily drip) + dedupe + ~1-in-5 bet
- Confidence-check (inverse mode)
- Idea bank (inbound voice-note capture → re-drip)
- Statement-grammar messaging + voice-transcript-tolerant input
- Guard rails: one drip/day, `pause`/`resume`, auto-stop after 3 unanswered
- Timing: fixed near audience peak + `drip_sent_at`/`gana_responded_at` columns

**v1 NICE (build if clean, else stub with a clear TODO):**
- Series expansion offers
- Pattern-surfacing: occasionally (NOT daily — that's noise) surface one genuinely non-obvious observation as a statement (e.g. "every part-2 you've made beat its part-1", "your food videos convert in December, flatten in July"). This is the one thing she literally cannot do for herself — she's inside the content and can't see the pattern.
- Hook + on-screen-text pre-writing for a chosen idea (upstream of editing, speeds her edit without touching it)
- Reject/taste logging: when she dismisses an idea, log it — what she declines is high-value taste signal over time

**DEFERRED (stub only — needs weeks of her real behavior):**
- Adaptive timing learner (columns exist now; learner comes later)
- Streak-aware encouragement (reinforce "you're converting well right now, keep going" when she's on a hot run — needs a performance-trend baseline first)
- Idea-quality tuning from her accept/reject history

---

## Data model notes

- Identity = **normalized caption prefix + resolved posted date** (screenshots give truncated captions + relative dates like "2w ago" — resolve against ingest date). No stable video_id until one is available; store the longest-seen caption prefix as the anchor.
- Per-window follower counts (7/28/60/365d) for one video are **separate observations, not overwrites** — they're different facts.
- Persist: sent ideas (for dedupe), banked ideas, `drip_sent_at`, `gana_responded_at`, idea verdicts (accept/reject), `paused` flag, unanswered-nudge counter.
- Populate `TopicTag` in `constants.js` NOW from real data — replace the `UNCLASSIFIED` stub with: apartment/home setup, moving, budget furniture, fitness/workouts, credit cards, tech/Amazon finds, food, lifestyle/dating-advice.

---

## Emotional-UX requirement (not optional — it's the point)

Because her pain is time-ROI and her instinct undervalues her best content: **every performance message leads with the follower number, not views**, and explicitly reframes low-view/high-follower videos as WINS. A 49K-view / 717-follower video must be celebrated as a win, or she'll kill her best format chasing view counts. This is copy — and it matters as much as any function.

---

## Build sequence (ordered; self-check after each; DO NOT stop for approval)

1. **Schema + constants finalization** (skeleton already built in Step 0). Apply the Supabase schema (videos + per-window observations, ingest_events, idea_log, banked ideas, sent-ideas dedupe, `drip_sent_at`/`gana_responded_at`, `paused` flag, unanswered-nudge counter). Populate `TopicTag` from real data. *Check:* schema applies clean; enums exported.
2. **Text ingestion** (`analyticsIngestor.js`): pasted transcript → parsed rows → normalized → upsert; resolve relative dates; per-window observations. *Check:* feed the sample transcript, get correct row count and follower numbers.
3. **Archive → ranked converter table.** *Check:* query returns her videos ranked by new_followers, with "weights + bands" (717) above "CalDiet" (542) despite far fewer views. **This proves the backbone. Log the table so Tim can eyeball it.**
4. **Enrichment** (`videoClassifier.js`): caption → tags from enums. *Check:* every row tagged; spot-log 10.
5. **Idea generator** (`ideaGenerator.js` + prompt): the loop above. *Check:* produces 3 ideas, each citing a real source winner + follower count, all in-lane, one flagged as a bet. **This is the heart — spend the most care here.**
6. **Drip + on-demand + inverse mode + idea bank** (`dripScheduler.js`, external cron → existing webhook; inbound voice-note capture). *Check:* manual trigger sends 3 statement-form ideas; "give me ideas" responds on demand; a voice-note deposits and re-drips.
7. **Guard rails + timing columns + statement-grammar pass** over all outbound copy. *Check:* pause/resume works; drip capped at 1/day; every performance line leads with followers.
8. **v1 NICE tier** if time allows; otherwise stub with TODOs. Then update `CLAUDE.md` with the resolved decisions and report the single next action to Tim.

---

## Conventions (unchanged)

All Anthropic calls → `claudeClient`. All DB → `supabaseClient`. All Telegram → `telegramClient`. All magic values → `constants.js`. Haiku = intent classification; Sonnet = idea generation + skill execution; Opus reserved for rare deep synthesis. No magic strings anywhere.

## Open questions for Gana (ask ONLY if genuinely blocked — keep it agile, prefer sane defaults)

- Confirm drip timezone + preferred time (default: ~7pm her local, from her active-hours data).
- Trending-sound ideas, or purely format/topic angles? (Default: format/topic angles; sounds are a later layer.)
- Any topics she's burned out on and wants excluded even if they convert?
