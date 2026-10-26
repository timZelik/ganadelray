# Progress

## Phase 0: Skeleton and dry-run pipeline: ✅ complete, awaiting review

**Acceptance:** *dropping a video in `./hub` produces normalized assets for 4 destination profiles and dry-run publish jobs visible in the UI.*
Verified on the real `docker compose` stack (all six services, Caddy on :8080): a 1920×1080 / 44.1 kHz export dropped into `./hub` produced 4 publish jobs (Instagram Reels, TikTok, YouTube Shorts, LinkedIn), each `published` in dry-run mode with the exact post in its request preview, and 4 assets at 1080×1920 H.264 High / AAC 48 kHz / +faststart in S3. Failure and retry were exercised on the same stack (a 2 s clip fails Reels/TikTok/LinkedIn with *"Video is 2.02s; minimum is 3s"*; Retry requeues it; retrying a published job returns 409). The same path runs automatically in `apps/worker/test/pipeline.integration.test.ts`.

### Test results

| Suite | Command | Result |
|---|---|---|
| Lint + typecheck (16 packages) | `pnpm lint && pnpm typecheck` | clean |
| Unit + connector contract (MSW) | `pnpm test` | 100 passed |
| Integration (Testcontainers: Postgres 17, Valkey 8, SeaweedFS S3, real ffmpeg) | `pnpm test:integration` | 24 passed |
| End-to-end (Playwright, dashboard) | `pnpm test:e2e` | 5 passed |

CI: `.github/workflows/fanout-ci.yml` (repository root) runs all of the above on every push that touches `fanout/`.

### What was built

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript strict (`noUncheckedIndexedAccess`, `erasableSyntaxOnly`), ESLint (no `any`, consistent type imports), Vitest projects (`unit`, `integration`). Backend packages run as TypeScript via Node's native type stripping, so there is no build step.
- **Domain:** source/destination/route kinds, typed errors (`RetryableError` / `PermanentError` / `ReauthRequiredError`), publish-job status machine, idempotency key (SHA-256 via Web Crypto, browser-safe), per-destination capability catalog, fan-out planning, hashtag rules.
- **Connectors core:** `SourceWatcher`, `Publisher`, `OAuthProvider`, `RateLimitPolicy`, a registry keyed by `(route, destinationKind)`, shared capability validation, and the one HTTP client: timeouts, retries with backoff + `Retry-After` (POST is never retried on 5xx, only on 429), audit logging with redaction, typed error mapping, per-adapter error classifiers, and a dry-run client that records the exact request.
- **Database:** Drizzle schema per §6 (connections, workflows, workflow destinations, source items, assets, publish jobs, watch cursors, audit logs), Postgres enums generated from the domain's constants, initial migration, repositories, AES-256-GCM token cipher (versioned format, tamper-evident), idempotent seed of the hub connection and the 4-destination workflow.
- **Queue:** typed queues, payload schemas validated on dequeue, an atomic multi-window sliding-log rate limiter (Lua; per connection + per platform), a distributed render lock, and a single error policy that maps error types to BullMQ retry behaviour.
- **Media:** typed `spawn` wrapper (no shell, bounded stderr, timeouts), ffprobe parsing (rotation-aware display dimensions, MOV vs MP4 by brand, faststart via box order), profiles from capabilities + pad/crop + overrides, conformance checks, ffmpeg argument builder (closed fixed GOPs, AAC 48 kHz, silent track for video-only masters, metadata stripped so phone GPS never leaks, `+faststart`), pass-through of conforming masters without copying.
- **Captions:** `{{originalCaption}}`, `{{hashtags}}`, `{{title}}`, `{{firstLine}}`; unknown-placeholder validation; per-destination hashtag sets (normalized, de-duplicated against the caption, capped by the platform limit); truncation that shortens the caption body rather than the hashtags, counts UTF-16 units (the strictest platform measure) and never splits an emoji; URL stripping for X cost-saving; `CaptionRewriter` with a no-op default.
- **Storage:** `ObjectStorage` with S3 (multipart upload, separate public endpoint for presigning, R2-compatible checksum settings) and in-memory implementations; content-addressed masters; renditions under a separate prefix with retention.
- **Local hub watcher:** recursive scan, ignores hidden paths and non-video files, a settle window so half-copied exports are skipped, a cursor on `max(mtime, ctime)` so files *moved* into the hub (which keep an old mtime) are still detected, sidecar `.txt` captions, path-traversal guard.
- **ConsolePublisher:** registered for every destination kind with that platform's real capabilities, so validation and rendering are exercised for real.
- **Worker:** watch → ingest → fan-out → prepare → publish → retention purge, with correlation ID = publish job ID across retries.
- **API:** Fastify + Zod type provider: health, list/filter jobs, job detail, retry (409 unless failed/skipped), Bull Board at `/admin/queues`.
- **Dashboard:** job list with status filter, auto-refresh, expandable rows (error, request preview), retry button, dry-run banner.
- **Infra:** multi-target Dockerfile (api, worker, web), `docker-compose.yml` (postgres, valkey, s3, migrate, api, worker, web/Caddy with automatic HTTPS via `SITE_ADDRESS`), `.env.example`.

### Efficiency work found during the live run

The first live drop rendered **4 separate encodes** for 4 near-identical outputs. Two fixes:

1. **Render fingerprints now describe the output, not the platform.** The fingerprint covers the encode parameters plus the resolved frame rate, or "passthrough". Platform caps such as file size and frame-rate range are left out because they don't change the bytes.
2. **A per-fingerprint render lock** stops concurrent prepare jobs racing to encode the same output.

Result on the live stack: **1 encode serves all 4 destinations** (asserted in the integration test).

## Verification against current platform docs

Capabilities live in `packages/domain/src/capabilities.ts`. Phase 0 only exercises them through validation and render profiles; each adapter phase must re-verify its platform.

| Destination | Values used | Source | Status |
|---|---|---|---|
| Instagram Reels | 3 s–15 min, 300 MB, 23–60 fps | Meta IG Platform `IG User Media` reference | ✅ verified |
| Instagram Reels | caption 2,200 chars, 30 hashtags | Long-standing IG Graph API docs; not re-surfaced in this search | ⚠️ re-verify in Phase 2 |
| TikTok | ≤ 10 min via API, 4 GB, 23–60 fps, caption 2,200 UTF-16 units | TikTok Content Posting API: media transfer guide + direct post reference | ✅ verified |
| YouTube Shorts | ≤ 180 s, title 100, description 5,000 | Secondary sources only (3-minute Shorts since Oct 2024) | ⚠️ re-verify in Phase 2 |
| LinkedIn | 3 s–30 min, ≤ 500 MB, commentary 3,000 | Microsoft Learn Videos API (2024-11) for length/size; commentary limit from a third-party source | ⚠️ partially verified |
| Facebook Reels, Threads, Pinterest, X, Stories, Feed | placeholders | not yet researched | ⏸ verify in their phases |

Notes from research: Meta's Reels publishing guide mentions **30 API-published Reels per 24 h** (§7 says ~30 per Page for Facebook, and 50–100 for Instagram's `content_publishing_limit`, which must be read live). TikTok confirms unaudited clients can post only privately.

## Deviations from the spec (decisions for review)

1. **MinIO → SeaweedFS (dev and tests).** MinIO stopped publishing community container images; `minio/minio` is gone from Docker Hub and the quay.io mirror was unreachable from the build environment. SeaweedFS (`weed mini`, pinned `4.50`) is S3-compatible and drop-in. The code is plain S3; production targets R2 unchanged. **Question:** keep SeaweedFS, or should I build MinIO from source / use another S3 server?
2. **better-auth deferred to Phase 1.** §13 scopes Phase 0 without login. **Until then the API and Bull Board are unauthenticated**: don't expose the stack publicly.
3. **TypeScript 6.0, not 7.0.** TypeScript 7 is the current `latest`, but typescript-eslint supports `<6.1`.
4. **Static ffmpeg 8.0 in the worker image** (`mwader/static-ffmpeg`) instead of Alpine's package. It gives pinned and reproducible builds with no distro-mirror dependency. The cost is a larger image (788 MB).
5. **Interface refinements** (shape kept):
   - `SourceWatcher.fetchMediaFile` takes the detected `SourceItemCandidate`, because the master is fetched before a `SourceItem` row exists.
   - `Publisher` gained `route`, `rateLimitPolicy` and `requiresConnection`, and `publish` accepts `Connection | null` for publishers that need no account.
   - `PublishContext` carries the `http` client, so dry-run is enforced by construction.
6. **Ecosystem changes absorbed:**
   - BullMQ 6 no longer bundles ioredis; it is used through the ioredis adapter.
   - MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. The old name is silently ignored, which would have let tests reach real networks; fixed and verified.
   - The local dev container had Node 22.22. Docker and CI use Node 24, and the code supports Node 22.18 or later.
7. **Development encryption key in `docker-compose.yml`**, so `docker compose up` works from a clean clone. The config **refuses that key when `NODE_ENV=production`**.

## Open questions and known limitations

- **Ambiguous publish outcomes.** If a non-idempotent platform call times out after the platform accepted it, a queue-level retry could post twice. The HTTP client never retries POST on 5xx, but Phase 2 adapters should persist intermediate IDs (e.g. the Instagram container ID) before publishing, and reconcile on retry.
- **Ingest failures** (corrupt or too-short masters) are visible only in Bull Board and the logs, because no publish job exists yet. Proposal for Phase 1: a "Sources" view showing source items and ingest errors.
- **Backlog scheduling.** Jobs stay `preparing` between rendering and their scheduled time. For far-future backlog slots in Phase 1, consider a distinct `scheduled` status.
- **Closed-GOP check.** Closed GOP is enforced on every encode, but not detected when deciding whether a master can pass through. Phone and NLE exports are virtually always closed-GOP.
- **`pnpm smoke`** (live publish of a fixture to a test account) arrives with the first real destination in Phase 1.

## Next: Phase 1 (real publishing via proxy)

`BufferPublisher` (GraphQL at `api.buffer.com`) and `UploadPostPublisher` behind the same interface; R2 presigned URLs end to end; Google Drive hub watcher; workflow CRUD in the UI (with template validation, which already exists); schedule slots and back-catalog mode; better-auth single-admin login protecting the API and Bull Board; `pnpm smoke`.
