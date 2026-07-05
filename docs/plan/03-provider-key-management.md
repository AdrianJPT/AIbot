# Phase 3 — Provider & API Key Management (Zero Downtime)

> Depends on: Phase 2. Parallelizable with Phase 4.
> Goal: AI provider keys and WhatsApp tokens live encrypted in the DB, are manageable from the admin UI, and can be rotated with **zero downtime and zero redeploys**. Supersedes PR #2 (`worktree-multi-provider`) — close that PR unmerged once this lands.

## Why the current design forces downtime

- `src/lib/openai.ts:4-11` caches one global client built from `process.env.OPENAI_API_KEY`. Changing the key = new env var = Railway redeploy; a bad key silently kills ALL replies (2026-07-02 incident).
- `Business.whatsappToken` (`prisma/schema.prisma:16`) is plaintext and singular — no way to stage a replacement token before the old one expires.

## Design

### Credential model (one table for both kinds)

```prisma
model Credential {
  id           String    @id @default(cuid())
  ownerId      String    // User.id — credentials belong to a user, shareable across their businesses
  kind         String    // "ai" | "whatsapp"
  provider     String    // ai: "openai" | "openrouter" | "google" ; whatsapp: "meta"
  label        String    // human name, e.g. "OpenAI prod (julio)"
  encryptedKey String    // AES-256-GCM: base64(iv):base64(ciphertext):base64(authTag)
  keyLast4     String
  baseUrl      String?   // ai only; null = provider default
  status       String    @default("standby") // "active" | "standby" | "revoked"
  lastUsedAt   DateTime?
  lastError    String?   // last failure message, cleared on success
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@index([ownerId, kind, status])
}
```

Business linkage (replaces PR #2's `provider` column and, eventually, `whatsappToken`):

```prisma
// added to Business
aiCredentialId       String?
whatsappCredentialId String?
```

Resolution order for AI calls: business's `aiCredentialId` → owner's `active` credential of kind `ai` → legacy `process.env.OPENAI_API_KEY` (removed at the end of this phase). Same pattern for WhatsApp tokens with `Business.whatsappToken` as legacy fallback.

### Encryption — `src/lib/crypto.ts`

- AES-256-GCM via `node:crypto`. Master key: `APP_ENCRYPTION_KEY` env (32 bytes, base64; generate with `openssl rand -base64 32`). Validate length in `src/lib/env.ts`.
- `encryptSecret(plain): string`, `decryptSecret(stored): string`. Random 12-byte IV per encryption; store `iv:ciphertext:authTag` base64-joined.
- Decrypted values never leave the server, never get logged, never appear in API responses (only `keyLast4`).

### Zero-downtime rotation flow (the core UX)

1. Admin adds a new credential → saved as `standby`.
2. Admin clicks **Probar** (test) → server does a real cheap call (AI: 1-token completion against the provider's cheapest model; WhatsApp: `GET /v21.0/{phone_number_id}` with the token). Result stored in `lastError`/`lastUsedAt` and returned.
3. Admin clicks **Activar** → single transaction: new credential `status = "active"`, previous active one of the same kind `status = "standby"`. Because resolution happens **per request** (no cached clients keyed by env), the very next webhook message uses the new key. Old key keeps working until that instant — no gap.
4. **Revocar** sets `status = "revoked"`; a credential in use by a business (`aiCredentialId`) cannot be revoked until reassigned (409 with explanation).

### Runtime resolution + fallback — `src/lib/ai/resolve.ts`

- `getAiClient(business)`: resolve credential (order above), build OpenAI SDK client with `apiKey` + `baseUrl` (OpenRouter: `https://openrouter.ai/api/v1`; Google AI Studio OpenAI-compat: `https://generativelanguage.googleapis.com/v1beta/openai/`).
- Cache clients in-memory keyed by `credential.id + updatedAt` (Map, max ~50 entries) — rotation changes `updatedAt`, so stale clients are never reused.
- On 401/403 from the provider at call time: log `EventLog(source:"credentials")`, set `lastError`, and retry once with the owner's `standby` AI credential if one exists (automatic failover).
- Refactor `generateResponse` (`src/lib/openai.ts`) to accept the resolved client; move to `src/lib/ai/generate.ts`. `src/lib/media.ts` (vision/transcription) uses the same resolution.

### API routes

- `GET/POST /api/credentials` — list (owner-scoped, no secrets) / create (validates key format per provider, encrypts).
- `POST /api/credentials/[id]/test` — the real-call test above.
- `POST /api/credentials/[id]/activate`, `POST /api/credentials/[id]/revoke`.
- `DELETE /api/credentials/[id]` — only when `revoked` and unreferenced.
- All behind `getSessionUser()` + owner scoping (Phase 2 pattern).

### Admin UI — `/settings/credentials`

- Table grouped by kind (AI / WhatsApp): label, provider, `••••` + last4, status badge, `lastUsedAt`, `lastError` tooltip, actions (Probar / Activar / Revocar / Eliminar).
- "Agregar credencial" dialog: kind, provider, label, key (password input), optional baseUrl. Key never redisplayed after save.
- Business form (`src/components/business-form.tsx`): selects for AI credential and WhatsApp credential (owner's non-revoked ones), replacing the raw `whatsappToken` input and PR #2's provider dropdown.

### Migration of existing secrets

- Script `prisma/scripts/migrate-secrets.ts` (tsx): for each business, wrap `whatsappToken` into a `Credential(kind:"whatsapp", status:"active")` owned by the business owner and link it; create an AI credential from `OPENAI_API_KEY` for the product owner. Idempotent.
- Final PR of the phase: drop `Business.whatsappToken`, remove `OPENAI_API_KEY` from env validation and Railway.

## Tests

- crypto round-trip + tamper detection (bad authTag throws).
- Resolution order incl. legacy fallbacks; client cache invalidation on rotation (`updatedAt` change → new client).
- Activate transaction: exactly one `active` per (owner, kind) after concurrent activations.
- Route auth + ownership (Phase 2 pattern).
- Failover: 401 from primary → standby used → `EventLog` written.

## PR slicing

1. **PR A**: Credential model + crypto + resolution lib + tests (no UI; legacy fallbacks keep prod working).
2. **PR B**: API routes + `/settings/credentials` UI + business form linkage.
3. **PR C**: secret migration script run + drop legacy column/env.

## Verification checklist

- [ ] Rotating the AI key from the UI mid-conversation: bot keeps answering with zero failed messages and no redeploy.
- [ ] Test button correctly distinguishes valid/invalid keys for all 3 AI providers + WhatsApp.
- [ ] No plaintext secret in DB dumps, logs, or API responses.
- [ ] Automatic failover to standby on 401 verified in test.
- [ ] `OPENAI_API_KEY` and `Business.whatsappToken` gone.
