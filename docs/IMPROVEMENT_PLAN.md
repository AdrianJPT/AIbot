# AIbot — Scalability, Fixes & Feature Roadmap

> **Audience: AI agents and developers implementing changes in this repo.**
> Each work item is self-contained: problem, evidence (file:line as of commit `1e2ecf9`), implementation steps, and acceptance criteria.
> Execute phases in order. Within a phase, items are independent unless a `Depends on:` note says otherwise.
> Line numbers may drift as items land — treat them as anchors, re-locate by symbol name.

## System overview (read first)

Next.js 14 App Router app (standalone output, Docker/Railway) that runs a multi-tenant WhatsApp AI assistant plus an admin dashboard.

- **Data model** (`prisma/schema.prisma`): `Business` (tenant, keyed by unique `phoneNumberId`, holds plaintext `whatsappToken`, `systemPrompt`, `businessInfo` JSON, per-tenant `model` + `maxHistoryMessages`) → `Conversation` (`@@unique([businessId, customerPhone])`, string `status`: `active | handed_off | closed`) → `Message` (string `role`). `Appointment` has **string** `date`/`time` fields.
- **Message flow**: `POST /api/webhook` (`src/app/api/webhook/route.ts`) returns 200 immediately and fire-and-forgets `processWebhookPayload` (`src/lib/message-handler.ts`) → resolves `Business` by `phoneNumberId` → upserts `Conversation` → loads last N messages → `generateResponse` (`src/lib/openai.ts`, plain chat completion, no tool calling) → `sendMessage` (`src/lib/whatsapp.ts`, Graph API v21.0).
- **Media** (`src/lib/media.ts`): images described with `gpt-4o-mini` vision, audio via `whisper-1`; results stored as text, original media never persisted.
- **Appointments are NOT created by the AI.** System prompts instruct the model to collect name/service/date/time, but no code parses the reply or writes an `Appointment`. Rows are only created via the admin panel / `POST /api/appointments`.
- **`configs/*.json` are documentation templates only** — never loaded at runtime; the DB is the source of truth.
- Deploy: single container, `Dockerfile` entrypoint runs `npx prisma db push && node server.js`. No migrations directory exists.

---

## Phase 0 — Security (do before anything else; the app is unsafe to expose today)

### P0-1: Verify WhatsApp webhook signatures

- **Problem**: `POST /api/webhook` accepts any body. Anyone who knows a `phoneNumberId` can forge messages, burn the shared OpenAI quota, and make the bot send WhatsApp messages with the real token.
- **Evidence**: `src/app/api/webhook/route.ts:19-29` — no `X-Hub-Signature-256` check. Only GET verifies `hub.verify_token`.
- **Implementation**:
  1. Add `WHATSAPP_APP_SECRET` to `.env.example` and Railway config.
  2. In the POST handler, read the raw body with `await req.text()` **before** JSON parsing (HMAC must run on raw bytes).
  3. Compute `crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")` and compare against the `x-hub-signature-256` header (strip the `sha256=` prefix) using `crypto.timingSafeEqual`.
  4. Return 401 on mismatch or missing header; only then `JSON.parse(rawBody)` and proceed.
- **Acceptance**: unsigned/mis-signed POST → 401 and no processing; correctly signed POST behaves as before. Unit test with a known secret + fixture payload.

### P0-2: Add authentication to the dashboard and all admin API routes

- **Problem**: Every page and every route under `src/app/api/**` (businesses, appointments, conversations, handoff, send) is unauthenticated. `README.md:110-112` acknowledges this.
- **Evidence**: no auth code anywhere; `NEXTAUTH_SECRET` is mentioned in the README but `next-auth` is not in `package.json`.
- **Implementation** (simplest robust option — single-admin bearer/session auth via Auth.js):
  1. `npm i next-auth@beta` (Auth.js v5). Create `src/lib/auth.ts` with the Credentials provider checking `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` (bcrypt) env vars. Export `auth`, `signIn`, `signOut` handlers.
  2. Add `src/app/api/auth/[...nextauth]/route.ts` and a `/login` page.
  3. Add `src/middleware.ts` protecting everything **except** `/api/webhook` and `/login` (the webhook must stay public — it is protected by P0-1's signature check instead).
  4. Add `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` to `.env.example`.
- **Acceptance**: unauthenticated request to any page/API (except webhook, login) redirects/401s; webhook still works without a session.
- **Note**: if multi-user roles are wanted later, that is feature F-5, not this item. Keep this minimal.

### P0-3: Stop leaking `whatsappToken` through the API

- **Problem**: tokens are returned in plaintext by `GET /api/businesses` and `GET /api/businesses/[id]`, and rendered into the edit form.
- **Evidence**: `src/app/api/businesses/route.ts:4-7`, `src/app/api/businesses/[id]/route.ts:9-12`, `src/components/business-form.tsx:114`.
- **Implementation**:
  1. Add a `select` (or a `sanitizeBusiness()` helper in `src/lib/`) that excludes `whatsappToken` from every GET response.
  2. In the edit form, show a placeholder (`••••` + "leave blank to keep current"); on PATCH, only update the token when a non-empty value is submitted.
  3. (Stretch, can be its own PR) Encrypt the token at rest with AES-256-GCM using an `ENCRYPTION_KEY` env var: encrypt on write in the API routes, decrypt only in `src/lib/whatsapp.ts` and `src/lib/media.ts` where it is used. Provide a one-off migration script for existing rows.
- **Acceptance**: no API response body contains a token; editing a business without touching the token field preserves it; sending messages still works.

### P0-4: Input validation on all API routes (zod)

- **Problem**: no validation anywhere. `POST /api/businesses` has no try/catch — a duplicate `phoneNumberId` throws an unhandled Prisma error (500 with stack). `model` accepts any string; `maxHistoryMessages` accepts negatives/huge values; `businessInfo`/`systemPrompt` are unbounded and get injected into every completion.
- **Evidence**: `src/app/api/businesses/route.ts:9-41`, `src/app/api/businesses/[id]/route.ts:14-41`, `src/app/api/appointments/route.ts:21-53`.
- **Implementation**:
  1. `npm i zod`. Create `src/lib/validation.ts` with schemas: `businessCreateSchema`, `businessUpdateSchema` (partial), `appointmentCreateSchema`, `appointmentUpdateSchema`, `sendMessageSchema`.
  2. Constraints: `model` ∈ allowlist (`gpt-4o-mini`, `gpt-4o`, …); `maxHistoryMessages` int 1–100; `systemPrompt` ≤ 8000 chars; `businessInfo` serialized ≤ 16 KB; `phoneNumberId` non-empty digits; `customerPhone` E.164-ish regex; appointment `date` ISO `YYYY-MM-DD`, `time` `HH:mm` (until P2-3 replaces them with DateTime).
  3. In every route: `const parsed = schema.safeParse(await req.json())` → 400 with `parsed.error.flatten()` on failure.
  4. Wrap Prisma calls; map `P2002` (unique violation) to 409 with a clear message.
- **Acceptance**: invalid payloads → 400 with field errors; duplicate `phoneNumberId` → 409, no 500s; valid payloads unchanged.

---

## Phase 1 — Correctness & reliability bugs

### P1-1: Deduplicate inbound WhatsApp messages (idempotency)

- **Problem**: Meta retries webhook deliveries. The handler never records WhatsApp's message `id` (not even in the `WaMessage` type), so retries reprocess: duplicate `Message` rows, duplicate OpenAI calls, duplicate replies to the customer.
- **Evidence**: `src/lib/message-handler.ts:13-27` (type lacks `id`), `:56-133` (no dedup check). Made worse by returning 200 before processing (`src/app/api/webhook/route.ts:22`).
- **Implementation**:
  1. Add `waMessageId String? @unique` to `Message` in `prisma/schema.prisma`.
  2. Capture `message.id` in the `WaMessage` type and pass it through `handleOneMessage`.
  3. Before processing, `prisma.message.findUnique({ where: { waMessageId } })` → skip if exists. Create the user `Message` row (with `waMessageId`) **before** the OpenAI call so a retry arriving mid-processing hits the unique constraint; catch `P2002` and skip.
- **Acceptance**: replaying the same webhook payload twice produces exactly one `Message` row, one OpenAI call, one outbound send. Test by POSTing the same fixture twice.
- **Depends on**: P2-1 (migrations) ideally lands first so this is a real migration, but `db push` works if not.

### P1-2: Process all webhook entries/changes, and handle errors per message

- **Problem**: only `entry[0].changes[0]` is read — WhatsApp batches multiple entries/changes into one payload; the rest are silently dropped. Also, one message failing aborts the rest of the loop.
- **Evidence**: `src/lib/message-handler.ts:30-36`, `:51-53`.
- **Implementation**:
  1. Nest loops: `for (const entry of body.entry ?? []) for (const change of entry.changes ?? [])`, filtering `change.field === "messages"`.
  2. Wrap each `handleOneMessage` in try/catch: log with context (`businessId`, `waMessageId`) and continue with the next message.
- **Acceptance**: a fixture with 2 entries × 2 messages produces 4 processed messages; a poisoned message doesn't block the others.

### P1-3: Give the fire-and-forget path a timeout and a fallback reply

- **Problem**: `void processWebhookPayload(body).catch(console.error)` — no timeout around OpenAI/WhatsApp calls, and on failure the customer gets silence.
- **Evidence**: `src/app/api/webhook/route.ts:22`; no `AbortController`/timeout in `src/lib/openai.ts:13-35` or `src/lib/whatsapp.ts:5-26`.
- **Implementation**:
  1. Pass `timeout: 30_000` to the OpenAI client constructor (`src/lib/openai.ts`) and `maxRetries: 2` (SDK built-ins).
  2. Add `AbortSignal.timeout(15_000)` to the `fetch` in `sendMessage` and media downloads.
  3. In `handleOneMessage`, wrap the generate+send block: on error, log and attempt to send a short static apology message (best-effort, its own try/catch), and still persist what happened.
  4. This item is a stopgap; the real fix is the queue (P3-1).
- **Acceptance**: with OpenAI unreachable (bad key in a test), the customer receives the fallback text within ~35s and the process doesn't hang.

### P1-4: Prevent appointment double-booking

- **Problem**: no constraint or check on `(businessId, date, time)`; concurrent bookings of the same slot both succeed.
- **Evidence**: `prisma/schema.prisma:53-67`, `src/app/api/appointments/route.ts:21-53`.
- **Implementation**:
  1. Add `@@unique([businessId, date, time])` on `Appointment` — but **exclude cancelled**: since Postgres partial unique indexes aren't expressible in Prisma schema, either (a) add the partial unique index via raw SQL in a migration (`CREATE UNIQUE INDEX ... WHERE status NOT IN ('cancelled')`) and document it, or (b) enforce in a `prisma.$transaction` with `findFirst` + create under `Serializable` isolation. Option (a) preferred once P2-1 (migrate) is in.
  2. Map the violation to 409 with a "slot taken" message in the POST route.
- **Acceptance**: two concurrent POSTs for the same business/date/time → one 201, one 409. Cancelled slots can be rebooked.
- **Depends on**: P2-1 for option (a); P2-3 changes the column types afterwards — coordinate (if P2-3 lands first, the index targets `startsAt` instead).

### P1-5: Type `role` / `status` fields as Prisma enums

- **Problem**: `Message.role`, `Conversation.status`, `Appointment.status` are free strings. `loadHistory` blindly casts `m.role as "user" | "assistant"` — a bad value corrupts the OpenAI request.
- **Evidence**: `prisma/schema.prisma:33,46,64`; `src/lib/message-handler.ts:145`.
- **Implementation**:
  1. Add enums: `MessageRole { user assistant system }`, `ConversationStatus { active handed_off closed }`, `AppointmentStatus { pending confirmed cancelled completed }`.
  2. Change the columns; existing data already uses these exact strings so the migration is a straight type change.
  3. Update all TS call sites (compiler will find them: message-handler, handoff route, appointment routes/pages, seed).
- **Acceptance**: `tsc --noEmit` clean; seed runs; filtering by status still works in the UI.
- **Depends on**: P2-1 (this must be a real migration; `db push` on enum changes can be destructive).

### P1-6: Use per-business model consistently (or intentionally not)

- **Problem**: vision and transcription hardcode models (`gpt-4o-mini`, `whisper-1`) regardless of `Business.model` — the per-tenant model setting silently only affects text.
- **Evidence**: `src/lib/media.ts:47,70`; `prisma/schema.prisma:20`.
- **Implementation**: pass `business.model` into `describeImageFromBuffer` for vision (keep `whisper-1` for audio — it's the only transcription model, add a code-level constant `TRANSCRIPTION_MODEL` so the choice is explicit). Document in the business form help text that `model` governs chat + vision.
- **Acceptance**: a business configured with `gpt-4o` uses it for image description; audio still transcribes.

---

## Phase 2 — Production foundations

### P2-1: Switch from `prisma db push` to Prisma Migrate

- **Problem**: no `prisma/migrations/` directory; `db push` runs on **every container start** (`Dockerfile:36`). No history, no rollback, and `db push` can drop data on incompatible changes without review.
- **Evidence**: `Dockerfile:36` (`npx prisma db push && node server.js`), `package.json:10`.
- **Implementation**:
  1. Run `npx prisma migrate dev --name init` against a dev DB to baseline (or `migrate diff` + `migrate resolve --applied` to baseline the existing prod DB without data loss — document the chosen path in the PR).
  2. Change the Dockerfile entrypoint to `npx prisma migrate deploy && node server.js`.
  3. Add scripts: `"db:migrate": "prisma migrate dev"`, `"db:deploy": "prisma migrate deploy"`. Keep `db:push` for local prototyping only, note it in README.
- **Acceptance**: fresh DB boots via `migrate deploy`; existing prod DB is baselined without data loss; subsequent schema PRs ship a migration file.
- **Do this early in Phase 2 — P1-1/P1-4/P1-5/P2-2/P2-3 all want real migrations.**

### P2-2: Add the missing DB indexes

- **Problem**: Postgres does not auto-index FK columns. Every inbound message runs `Message.findMany({ where: { conversationId }, orderBy: { createdAt: desc } })` unindexed; appointments/conversations pages filter unindexed columns.
- **Evidence**: query patterns at `src/lib/message-handler.ts:139-143`, `src/app/api/appointments/route.ts:9-14`, `src/app/api/conversations/route.ts:8-13`; schema has only the one composite unique (`prisma/schema.prisma:39`).
- **Implementation** — add to `prisma/schema.prisma`:
  - `Message`: `@@index([conversationId, createdAt])`
  - `Appointment`: `@@index([businessId, date])`, `@@index([businessId, status])` (revisit after P2-3 → `[businessId, startsAt]`)
  - `Conversation`: `@@index([businessId, status])`, `@@index([businessId, updatedAt])` (conversation list sorts by recency)
- **Acceptance**: migration applies; `EXPLAIN` on the history query shows index scan.
- **Depends on**: P2-1.

### P2-3: Replace string `date`/`time` with `startsAt DateTime` + business timezone

- **Problem**: `date String` + `time String` — no validation, no timezone, no DST semantics, no range queries; filtering is exact string match.
- **Evidence**: `prisma/schema.prisma:62-63`; string-match filtering at `src/app/api/appointments/route.ts:13` and `src/app/appointments/page.tsx:14-19`.
- **Implementation**:
  1. Add `timezone String @default("America/Mexico_City")` to `Business` (IANA name, editable in the business form).
  2. Add `startsAt DateTime` (+ optional `durationMinutes Int @default(30)`) to `Appointment`. Migration: backfill `startsAt` from `date`/`time` parsed in the business timezone (write the backfill as SQL in the migration or a script run once); keep old columns for one release, then drop in a follow-up migration.
  3. Use a tiny tz lib (`date-fns-tz` or Temporal polyfill) for parse/format; UI shows times in the business timezone.
  4. Update validation (P0-4), API filters (range: `gte`/`lt` on day boundaries in business tz), table sorting, and the AI prompt date instructions.
- **Acceptance**: creating an appointment stores correct UTC instant; day filter returns correct rows across a DST boundary; old data appears at the right local time.
- **Depends on**: P2-1, P0-4. Coordinate with P1-4's unique index.

### P2-4: Tests, lint, typecheck, CI

- **Problem**: zero tests, no `lint`/`test`/`typecheck` scripts, no CI. Every other item in this plan needs a safety net.
- **Evidence**: `package.json:5-13`.
- **Implementation**:
  1. `npm i -D vitest @vitest/coverage-v8 eslint eslint-config-next`. Scripts: `"test": "vitest run"`, `"lint": "next lint"`, `"typecheck": "tsc --noEmit"`.
  2. First test targets (pure logic, no DB): `buildSystemPrompt` (`src/lib/prompt.ts`), webhook payload parsing/extraction (extract a pure `extractMessages(body)` from `message-handler.ts` to make it testable), signature verification (P0-1), zod schemas (P0-4).
  3. Integration tests (Vitest + a test Postgres via `docker-compose`): webhook → message persisted → dedup; mock OpenAI/WhatsApp with `msw` or dependency injection (see P3-4 refactor note).
  4. GitHub Actions workflow: `lint` + `typecheck` + `test` on PR; build the Docker image on main.
- **Acceptance**: `npm run lint && npm run typecheck && npm test` all pass locally and in CI on PRs.
- **Do this alongside Phase 0 if possible — everything else should land with tests.**

### P2-5: Structured logging + health check

- **Problem**: only scattered `console.error`; no request correlation, no health endpoint for Railway, no error tracking.
- **Evidence**: `src/app/api/webhook/route.ts:23,26`.
- **Implementation**:
  1. `npm i pino`. Create `src/lib/logger.ts` (JSON logs, level from `LOG_LEVEL`). Child loggers with `{ businessId, conversationId, waMessageId }` through the message pipeline.
  2. Add `src/app/api/health/route.ts`: returns `{ ok: true }` + a `prisma.$queryRaw\`SELECT 1\`` check. Point Railway's healthcheck at it (`railway.json`).
  3. Optional: Sentry (`@sentry/nextjs`) if an error tracker is wanted — separate PR.
- **Acceptance**: logs are JSON with correlation fields; `/api/health` returns 200 with DB up, 503 with DB down.

### P2-6: Pagination on list APIs and pages

- **Problem**: all `findMany` calls are unbounded — conversations/appointments lists will grow without limit and the JSON responses with them.
- **Evidence**: `src/app/api/appointments/route.ts:9-19`, `src/app/api/conversations/route.ts:8-16`, `src/app/api/businesses/route.ts:4-7`, `src/app/appointments/page.tsx:13-24`.
- **Implementation**:
  1. Cursor pagination (`take: 50`, `cursor` on `id`, ordered by `createdAt desc`) on conversations, appointments, and messages-within-conversation APIs. Response shape: `{ items, nextCursor }`.
  2. Server pages: read `?cursor=` searchParam, render "Load more" / next link.
  3. While here, extract the duplicated appointment where-clause builder (`src/app/api/appointments/route.ts:9-17` ≡ `src/app/appointments/page.tsx:13-24`) into `src/lib/queries/appointments.ts` and use it in both.
- **Acceptance**: lists return ≤ 50 items per request; duplicate filter logic exists in exactly one module.

---

## Phase 3 — Scalability architecture

### P3-1: Queue-based message processing (the big one)

- **Problem**: all AI work runs in-process, fire-and-forget, inside the web container. Messages within a payload are processed serially; a crash between the 200 response and completion loses the message; the dashboard and the bot compete for one event loop. This is the main 10x blocker.
- **Evidence**: `src/app/api/webhook/route.ts:22`, `src/lib/message-handler.ts:51-53`, single service in `docker-compose.yml:19-30` / `railway.json`.
- **Implementation** (BullMQ + Redis; Railway has a Redis plugin):
  1. `npm i bullmq ioredis`. Add `REDIS_URL` to env.
  2. Webhook handler (after P0-1 verification + P1-1 dedup): enqueue one job per message — `queue.add("inbound", { businessId, waMessage }, { jobId: waMessageId, attempts: 3, backoff: { type: "exponential", delay: 2000 } })`. `jobId = waMessageId` gives free queue-level dedup. Return 200.
  3. New worker entrypoint `src/worker.ts` (compiled separately or run with `tsx`): a BullMQ `Worker` with `concurrency: 5` calling the existing `handleOneMessage` logic. **Per-business ordering**: use BullMQ group support or simplest — set job `jobId` and use one queue with a per-conversation lock (Redis `SET NX` with TTL) so two messages from the same customer never interleave.
  4. Deploy: second Railway service (same image, command `node worker.js`) or second process in docker-compose. Keep a `WORKER_MODE` env switch.
  5. Failure handling: BullMQ retries; on final failure, send the fallback apology (P1-3) and log.
- **Acceptance**: webhook returns in <100 ms; killing the worker mid-job and restarting reprocesses the job exactly once; two rapid messages from one customer are answered in order.
- **Depends on**: P1-1 (dedup), P2-5 (logging). This is a multi-PR change — split as: (PR1) queue + worker skeleton behind env flag, (PR2) switch webhook to enqueue, (PR3) second deploy service.

### P3-2: Cache the business lookup

- **Problem**: `Business` is refetched by `phoneNumberId` on every webhook, and `buildSystemPrompt` re-serializes `businessInfo` on every message.
- **Evidence**: `src/lib/message-handler.ts:43-46`, `src/lib/prompt.ts:3-11`.
- **Implementation**: in-memory TTL cache (60 s) keyed by `phoneNumberId` in `src/lib/business-cache.ts` (a `Map` + timestamp is enough; no dependency needed). Invalidate on business PATCH/DELETE (best-effort — TTL covers multi-instance staleness). Cache the built system prompt alongside. If/when the worker (P3-1) is multi-instance, this stays correct because of the TTL.
- **Acceptance**: N messages within 60 s to the same business → 1 business query. Editing a business takes effect within 60 s.

### P3-3: Rate limiting & spend protection

- **Problem**: nothing limits inbound processing or OpenAI spend. One flooded number (or forged traffic pre-P0-1) drains the shared `OPENAI_API_KEY` for all tenants.
- **Evidence**: no limiter anywhere; single key usage in `src/lib/openai.ts:5-11`.
- **Implementation**:
  1. Per-customer limiter: max ~10 inbound messages/min per `(businessId, customerPhone)` — Redis `INCR` + `EXPIRE` (reuse P3-1's Redis). Over limit: skip the AI call, optionally send one "please slow down" notice per window.
  2. Per-business daily budget: count OpenAI calls per business per day in Redis; add `dailyMessageLimit Int @default(1000)` to `Business`. Over limit: static "unavailable" reply + log/alert.
  3. Admin API rate limit is unnecessary once P0-2 auth is in — skip it.
- **Acceptance**: 11th message in a minute from one customer gets no AI call; the counter resets after the window.
- **Depends on**: P3-1 (Redis available).

### P3-4: Decouple lib modules for testability (dependency injection light)

- **Problem**: `message-handler.ts` directly imports the OpenAI client, Prisma singleton, and `sendMessage` — integration tests can't substitute them, which blocks P2-4's deeper tests and any future provider swap.
- **Evidence**: imports at `src/lib/message-handler.ts:1-11`.
- **Implementation**: extract pure functions (`extractMessages`, `parseUserContent`) and pass effects as a `deps` object (`{ db, ai, wa }`) with defaults, so production call sites don't change but tests inject fakes. Keep it boring — no DI framework.
- **Acceptance**: webhook→reply integration test runs with fake OpenAI/WhatsApp and a real test DB.

---

## Phase 4 — Features (each is a standalone PR; all assume Phases 0–2 are done)

### F-1: AI-driven appointment booking (tool calling) — **highest product value**

- **Problem/Gap**: prompts promise booking but nothing writes `Appointment` rows. This closes the core product loop.
- **Implementation**:
  1. In `src/lib/openai.ts`, switch `generateResponse` to the tools API. Define tools: `check_availability({ date })` → returns open slots (query appointments for that business/day, diff against business hours from `businessInfo`), `create_appointment({ customerName, service, date, time })` → validates (zod), creates the row (guarded by P1-4's constraint), returns confirmation, `cancel_appointment({ date, time })`.
  2. Tool-call loop: run completion → if `tool_calls`, execute each, append tool results, re-call (max 3 rounds) → final text to customer.
  3. Store business hours as a structured field: add `businessHours Json?` to `Business` (`{ mon: [["09:00","18:00"]], ... }`) with a form editor; fall back to free-text `businessInfo` when absent.
  4. Set `conversationId` and `customerPhone` on created appointments from the pipeline context (never trust the model for identity fields).
  5. Persist tool calls as `Message` rows with `role: system`-style audit entries or a new `toolLog Json` column — keep the audit trail.
- **Acceptance**: end-to-end WhatsApp conversation books a real appointment visible in the admin panel; slot conflicts are refused with an alternative offered; the model cannot book outside business hours.
- **Depends on**: P0-4, P1-4, P2-3 (dates), ideally P3-1.

### F-2: Appointment reminders

- **Implementation**: worker cron (BullMQ repeatable job, every 5 min) finds `confirmed` appointments with `startsAt` in ~24 h and ~1 h windows not yet reminded (`remindedAt DateTime?` columns), sends a WhatsApp **template message** (required outside the 24 h session window — the business must register a template in Meta; store the template name on `Business`).
- **Acceptance**: appointment created >24 h ahead gets exactly one 24 h and one 1 h reminder; no duplicates on worker restart.
- **Depends on**: P2-3, P3-1.

### F-3: Human handoff notifications + agent reply UX

- **Gap**: handoff exists (`src/app/api/conversations/[id]/handoff/route.ts`, `send/route.ts`) but nobody is told when a conversation needs a human, and the customer gets silence.
- **Implementation**:
  1. Detect handoff *requests*: add a `request_human_handoff` tool (F-1's loop) or keyword fallback; on trigger set status `handed_off`, send the customer "connecting you with our team".
  2. Notify: send a WhatsApp message to a new `Business.ownerPhone` field (or email via Resend) with a dashboard deep link.
  3. Dashboard: conversations list gets a "needs attention" filter + badge (status `handed_off`, sorted by `updatedAt`); polling or SSE refresh on the conversation view so agent replies appear live.
- **Acceptance**: customer asking for a human freezes the bot, notifies the owner, and the owner can reply from the dashboard; "close" returns the conversation to the bot.

### F-4: Dashboard analytics

- **Implementation**: extend `src/app/page.tsx` + `stats-card.tsx`: messages/day (last 30 d), conversations per business, appointments by status, handoff rate, estimated OpenAI token spend (store `promptTokens`/`completionTokens` from each completion response on the assistant `Message` row — add columns — and price by model). Single grouped Prisma queries (`groupBy`), rendered with a lightweight chart lib (or plain SVG bars).
- **Acceptance**: dashboard shows real aggregates; token cost per business per month is visible.

### F-5: Business self-service (multi-user auth) — only if the product goes SaaS

- Extend P0-2 to DB-backed users with a `role` and `businessId` scoping: owners see only their business's conversations/appointments; `admin` sees all. Every API route gets a scoping `where` clause derived from the session. **Do not start this before P0-2 is stable.**

### F-6: Persist and display original media

- **Gap**: `Message.mediaUrl` exists but is never written; the admin can only see AI descriptions.
- **Implementation**: in `src/lib/media.ts`, after downloading media from WhatsApp, upload the buffer to Supabase Storage (already on Supabase per DB setup) or S3; store the storage URL in `mediaUrl`; render `<img>`/`<audio>` in `conversation-view.tsx`. Note WhatsApp media URLs themselves expire after ~5 min — persisting the binary is required, not the URL.
- **Acceptance**: an image sent by a customer is viewable in the conversation view a day later.

---

## Cleanups (bundle into related PRs, not standalone)

| Item | Evidence | Action |
|---|---|---|
| Duplicated appointment filter logic | `src/app/api/appointments/route.ts:9-17` ≡ `src/app/appointments/page.tsx:13-24` | Folded into P2-6 |
| `configs/*.json` unused at runtime | README notes DB is source of truth | Move to `docs/examples/` with a README line, or delete |
| `NEXTAUTH_SECRET` mentioned but unused | `README.md:112` | Resolved by P0-2 (becomes `AUTH_SECRET`) |
| `Dockerfile` placeholder `DATABASE_URL` build ARG | `Dockerfile:14-15` | Harmless; add a comment stating it's a build-time placeholder never used at runtime |
| DB pool sizing | `src/lib/db.ts` singleton is fine | Set `connection_limit` on `DATABASE_URL` (Supabase pooler): web ≈ 5, worker ≈ concurrency+2 |
| Spanish user-facing strings | throughout | Intentional (Mexico-market product). Keep customer-facing text Spanish; keep code identifiers/comments English |

---

## Suggested execution order (PR-sized slices)

| # | PR | Items | Size |
|---|----|-------|------|
| 1 | Webhook signature verification + tests scaffold | P0-1, P2-4 (scaffold) | S |
| 2 | Zod validation on all routes | P0-4 | M |
| 3 | Admin auth (Auth.js) + token redaction | P0-2, P0-3 | M |
| 4 | Prisma Migrate baseline + indexes | P2-1, P2-2 | S |
| 5 | Message dedup + full payload iteration + timeouts | P1-1, P1-2, P1-3 | M |
| 6 | Enums + double-booking constraint | P1-5, P1-4 | M |
| 7 | Logging + health check | P2-5 | S |
| 8 | Pagination + query dedup | P2-6 | M |
| 9 | DateTime appointments + timezone | P2-3 | M |
| 10 | Queue + worker (3 sub-PRs, see P3-1) | P3-1, then P3-2, P3-3 | L |
| 11 | Handler DI refactor + integration tests | P3-4 | M |
| 12+ | Features F-1 … F-6, each its own PR | | M–L each |

**Rules for implementing agents**: one PR per row; every schema change ships as a migration (post-PR-4); every PR adds/updates tests (post-PR-1); keep PRs under ~400 changed lines — split if larger; re-verify file:line anchors before editing (this doc reflects commit `1e2ecf9`).
