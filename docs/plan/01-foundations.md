# Phase 1 — Foundations & Security

> Depends on: nothing. Blocks: all other phases.
> Goal: make the platform safe and testable before adding features. No user-visible changes except fewer silent failures.

## Why first

- Every API route is public today; Phase 2 adds auth, but the webhook needs its own protection (signature verification) because it must stay public.
- Realtime, takeover and provider rotation all touch `message-handler.ts`; we need a test harness before refactoring it.
- Prior incident (2026-07-02): assistant replies silently disappeared because `generateResponse` threw after the user-message insert and the webhook swallowed the error. Observability here prevents repeats.

## Tasks

### 1.1 Test harness (Vitest)

- Add dev deps: `vitest`, `@vitest/coverage-v8`. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- Create `vitest.config.ts` with `@` path alias matching `tsconfig.json`.
- Create `src/lib/__tests__/fixtures/webhook-payload.ts` exporting realistic WhatsApp Cloud API payloads (text, image, audio, location, interactive, status update). Base them on the shapes parsed in `src/lib/message-handler.ts:13-27` and `150-201`.
- First test: `parseUserContent`-level coverage via `processWebhookPayload` with mocked prisma/openai/whatsapp modules (use `vi.mock`).

**Acceptance criteria**
- `npm test` passes locally and in CI (add `.github/workflows/ci.yml`: install, prisma generate, typecheck `tsc --noEmit`, test).
- Fixtures cover all 6 message types + a delivery-status payload.

### 1.2 Webhook signature verification

WhatsApp signs POSTs with `X-Hub-Signature-256: sha256=<hmac>` using the Meta app secret.

- New env: `WHATSAPP_APP_SECRET`.
- In `src/app/api/webhook/route.ts` POST handler: read the raw body (`await req.text()`), compute HMAC-SHA256 with `node:crypto`, compare with `timingSafeEqual`. On mismatch → `401`, do not process.
- Parse JSON only after verification.
- Keep GET verification (`hub.verify_token`) unchanged.

**Acceptance criteria**
- Request with valid signature → 200 and processed.
- Missing/invalid signature → 401, nothing written to DB.
- Unit tests for both using the fixtures.

### 1.3 Webhook idempotency (dedupe retries)

Meta retries webhooks; today each retry duplicates messages.

- Migration: add `wamid String? @unique` to `Message` (WhatsApp message id, present as `messages[].id` in payloads).
- In `handleOneMessage` (`src/lib/message-handler.ts:56`), persist `wamid` on the user message; skip processing if a message with that `wamid` already exists (`P2002` catch or pre-check).

**Acceptance criteria**
- Replaying the same fixture payload twice creates exactly one user message and one assistant reply.

### 1.4 Error observability

- Migration: new model
  ```prisma
  model EventLog {
    id        String   @id @default(cuid())
    level     String   // "error" | "warn" | "info"
    source    String   // "webhook" | "ai" | "whatsapp-send" | "auth" | "credentials"
    message   String
    detail    Json?
    businessId String?
    createdAt DateTime @default(now())
    @@index([createdAt])
    @@index([source, createdAt])
  }
  ```
- Create `src/lib/log.ts` with `logEvent(level, source, message, detail?, businessId?)` — writes to `EventLog` AND `console.error/warn` (Railway captures stdout). Must never throw (wrap in try/catch).
- Wrap the AI call and WhatsApp send in `handleOneMessage` so failures are logged with businessId + conversationId, and the customer receives a fallback text ("Lo siento, tuve un problema técnico. Intenta de nuevo en un momento.") instead of silence.

**Acceptance criteria**
- Forcing `generateResponse` to throw in a test → `EventLog` row with source `"ai"` + fallback message sent + user message still persisted.

### 1.5 Env validation at boot

- Create `src/lib/env.ts`: validate required env vars at module load (plain checks, no new deps), throw with a clear list of missing vars. Import from `src/lib/db.ts` so any server entry fails fast.

**Acceptance criteria**
- Booting without `WHATSAPP_APP_SECRET` fails with an explicit message naming the var.

## PR slicing

1. **PR A**: 1.1 + 1.5 (harness + env validation)
2. **PR B**: 1.2 + 1.3 (signature + idempotency, one migration)
3. **PR C**: 1.4 (EventLog + error paths)

## Out of scope

- Auth on admin API routes (Phase 2 — do not invent an interim API-key scheme).
- Delivery statuses UI (Phase 6; the fixture is added now, handling later).

## Verification checklist (end of phase)

- [ ] CI green: typecheck + tests.
- [ ] Simulated webhook payload with valid signature produces user+assistant messages exactly once.
- [ ] Invalid signature rejected with 401.
- [ ] AI failure produces `EventLog` row + fallback WhatsApp message.
