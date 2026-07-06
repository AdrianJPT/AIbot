# Phase 7 — WABA / PhoneNumber hierarchy

> **Depends on:** Phase 2 (auth + multitenancy), Phase 3 (credentials), Phase 5 (realtime + RLS), admin onboarding (`22df7cb`).
> **Blocks:** any future multi-number feature (number-level routing, number-level bots, per-number analytics).
> **Goal:** split the phone number out of `Business` into its own `PhoneNumber` model so the domain matches Meta's real hierarchy — Client (User) → Business (WABA) → PhoneNumber → Conversation — and fix the latent issues found around the current one-hop model.
>
> Evidence baseline: commit `22df7cb` (`feat: admin-managed client onboarding`). All `file:line` references below are pinned to that commit.

## 1. Target domain model

| Domain concept | Meta concept | DB model | Notes |
|---|---|---|---|
| Client | — | `User` (`role: "client"`) | Already exists. The login the platform admin hands to each customer. No schema change. |
| Business | WhatsApp Business Account (WABA) | `Business` | Keeps AI config, prompts, limits, credentials, `ownerId`. Gains optional `wabaId`. Loses phone fields. |
| Phone number | Phone number inside a WABA | `PhoneNumber` (new) | Owns `phoneNumberId` (Meta id), `displayPhone`, `whatsappCredentialId`, `isActive`. |
| Chat | Conversation with a customer | `Conversation` | Hangs off `PhoneNumber`. Keeps a denormalized `businessId` (see §3, decision D2). |

```
User (client)
 └── Business (= WABA)            ← AI models, systemPrompt, limits, aiCredentialId
      └── PhoneNumber             ← phoneNumberId, displayPhone, whatsappCredentialId
           └── Conversation       ← unique per (phoneNumberId, customerPhone)
                └── Message
```

`Appointment` stays keyed by `businessId` (it is a business-level booking, independent of which number the customer wrote to). `Credential` stays owner-scoped.

## 2. Schema changes

```prisma
model Business {
  // REMOVE: phoneNumberId, displayPhone, whatsappToken, whatsappCredentialId
  // ADD:
  wabaId       String?       @unique // Meta WABA id, informational for now
  phoneNumbers PhoneNumber[]
  // ownerId becomes REQUIRED in the cleanup slice (see D4)
}

model PhoneNumber {
  id                   String         @id @default(cuid())
  businessId           String
  business             Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  phoneNumberId        String         @unique // Meta's opaque phone_number_id (webhook hot path)
  displayPhone         String? // human-readable "+<country> <number>", shown as item title
  whatsappCredentialId String?
  isActive             Boolean        @default(true)
  conversations        Conversation[]
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  @@index([businessId])
}

model Conversation {
  // ADD:
  phoneNumberId String
  phoneNumber   PhoneNumber @relation(fields: [phoneNumberId], references: [id], onDelete: Cascade)
  // KEEP businessId (denormalized copy of phoneNumber.businessId — see D2)

  // CHANGE unique key:
  @@unique([phoneNumberId, customerPhone]) // was [businessId, customerPhone]
  @@index([phoneNumberId, lastMessageAt])
  @@index([businessId, lastMessageAt]) // keep: dashboards + RLS still filter by businessId
}

model EventLog {
  // ADD (optional, no FK — same convention as businessId):
  phoneNumberId String?
}
```

Note: `whatsappToken` does NOT move to `PhoneNumber`. It is dropped (D3).

### Data migration (single SQL migration, expand → backfill → contract within it)

1. Create `PhoneNumber` table.
2. For every existing `Business`, insert one `PhoneNumber` copying `phoneNumberId`, `displayPhone`, `whatsappCredentialId`, `isActive`.
3. For any business whose `whatsappToken` is non-empty and `whatsappCredentialId` is null: create an encrypted `Credential` row (reuse the logic in `prisma/scripts/migrate-secrets.ts:57-78`) and point the new `PhoneNumber.whatsappCredentialId` at it. Because that step needs AES-GCM encryption, run it as a Node script (`prisma/scripts/migrate-phone-numbers.ts`) executed before the contract migration, not as raw SQL.
4. Backfill `Conversation.phoneNumberId` from the business's (single) phone number.
5. Drop `Business.phoneNumberId / displayPhone / whatsappToken / whatsappCredentialId`; add constraints/indexes above.

Run order in prod: expand migration → Node backfill script → contract migration. Keep the drop of `whatsappToken` in the contract step so a rollback window exists.

## 3. Decisions (with tradeoffs)

**D1 — Keep the model named `Business`, add `wabaId`.** Renaming the model to `Waba` would touch every file for zero functional gain. The WABA semantics are documented here and via the `wabaId` column.

**D2 — `Conversation` keeps a denormalized `businessId` alongside the new `phoneNumberId`.** This is the load-bearing decision:

- The Supabase RLS policies (`prisma/migrations/20260705112425_enable_realtime_and_rls/migration.sql:50-75` and `20260705230000_add_admin_realtime_policies/migration.sql:34-56`) hardcode the one-hop join `Conversation.businessId → Business.ownerId`. They are manually applied and effectively untestable locally (`docs/plan/PHASE5_MANUAL_STEPS.md`). Keeping `businessId` means **zero RLS changes** and no risk of silently breaking realtime tenant isolation.
- `conversationScope` / `appointmentScope` (`src/lib/scope.ts:29-39`) and every dashboard/list query keep working unchanged.
- Cost: one redundant column, maintained at the single place conversations are created (the webhook upsert in `src/lib/message-handler.ts`). To keep it consistent, `PhoneNumber.businessId` is immutable — the PATCH endpoint must reject reparenting a number to another business.

Alternative rejected: pure normalization (`Conversation → PhoneNumber → Business` only). Cleaner on paper, but it forces rewriting the RLS policies as two-hop joins in production SQL — highest-risk, lowest-value change in the whole phase.

**D3 — Drop the plaintext `whatsappToken` column and the raw-token path entirely.** Tokens live only in encrypted `Credential` rows; `PhoneNumber.whatsappCredentialId` is the primary source. This kills the plaintext secret (`prisma/schema.prisma:28`) and forces every consumer through credential resolution. Keep the owner-level active-WhatsApp-credential fallback (`src/lib/whatsapp.ts:32-38`) for one release, but log an `EventLog` warn when it is used, so it can be dropped once prod shows zero hits.

**D4 — Make `Business.ownerId` required (cleanup slice).** An orphaned business is invisible to every client scope yet fully operable via webhook (`src/lib/scope.ts` guards, `src/lib/ai/resolve.ts:71-91`). Backfill/verify no null owners in prod first, then make the column required.

## 4. Bugs & issues to fix in this phase

| # | Issue | Where | Fix |
|---|---|---|---|
| B1 | **Media downloads bypass credential resolution** — inbound image/audio uses raw `business.whatsappToken` while sends use `resolveWhatsappToken`. A business with only a credential (empty legacy token) gets working text but silently broken media. | `src/lib/message-handler.ts:386-390` | `parseUserContent` receives the token already resolved by `resolveWhatsappToken(phoneNumber, ownerId)`; the raw column no longer exists after D3. |
| B2 | Plaintext WhatsApp token on `Business`, legacy fallback still live. | `prisma/schema.prisma:29`, `src/lib/whatsapp.ts:43-59` | D3. |
| B3 | Conversation unique key `[businessId, customerPhone]` would merge chats from two numbers of the same WABA into one thread. | `prisma/schema.prisma:82` | Move to `[phoneNumberId, customerPhone]`. |
| B4 | Owner-wide WhatsApp credential fallback is ambiguous with multiple numbers (`findFirst` last-wins). | `src/lib/whatsapp.ts:32-38` | `PhoneNumber.whatsappCredentialId` becomes the source of truth; fallback demoted to warn-logged transition path (D3). |
| B5 | Nullable `ownerId` orphan businesses. | `prisma/schema.prisma:38` | D4. |
| B6 | Webhook hot-path lookup must stay indexed after the move. | `src/lib/message-handler.ts:72-79` | `@unique` on `PhoneNumber.phoneNumberId` + `@@index([businessId])`; lookup becomes `phoneNumber.findFirst({ where: { phoneNumberId, isActive: true, business: { isActive: true } }, include: { business: true } })`. |
| B7 | Credential "test" flow uses a free-text `phoneNumberId` input. | `src/features/credentials/containers/credentials-panel-container.tsx:39-138` | Replace with a real `PhoneNumber` picker (select from the owner's numbers). |
| B8 | `EventLog` can only attribute events to a business. | `prisma/schema.prisma:118-129`, `src/lib/log.ts` | Add optional `phoneNumberId` (no FK, same convention); pass it from `message-handler`. |

## 5. Code changes by area

### Webhook / messaging core
- `src/lib/message-handler.ts:62-79` — resolve tenant via `PhoneNumber` (B6); thread the `phoneNumber` object through `handleOneMessage`; conversation upsert sets both `phoneNumberId` and denormalized `businessId`; pass resolved token to `parseUserContent` (B1); include `phoneNumberId` in EventLog calls (B8).
- `src/lib/whatsapp.ts` — `resolveWhatsappToken(phoneNumber, ownerId)` (credential-first, warn-logged owner fallback); `sendBusinessMessage(business, …)` → `sendFromNumber(phoneNumber, ownerId, to, text)`.
- `src/app/api/conversations/[id]/send/route.ts:22-41` — load `conversation.phoneNumber` (include business for scope) and send through it.

### API
- `src/app/api/businesses/*` — remove the three phone fields from create/PATCH/list/detail payloads; add `wabaId`.
- New `src/app/api/businesses/[id]/phone-numbers/route.ts` (GET, POST) and `src/app/api/phone-numbers/[id]/route.ts` (PATCH, DELETE) — admin-only mutations (mirror `requireAdmin` pattern from `src/app/api/businesses/route.ts:7-25`); PATCH rejects `businessId` changes (D2); P2002 on `phoneNumberId` → friendly 409 (same pattern as `businesses/route.ts:91-96`); DELETE cascades conversations — require an explicit `?confirm=` guard like business delete if one exists, otherwise return count in a dry-run response first.
- `src/app/api/conversations/route.ts` — keep `businessId` filter, add optional `phoneNumberId` filter; include `phoneNumber: { select: { id, displayPhone } }` in list items.
- `src/lib/scope.ts` — unchanged (thanks to D2). Add `phoneNumberScope(user)` = `{ business: { ownerId } }` for the new routes.

### UI (feature folders, UI copy in Spanish like the rest of the app)
- `src/features/businesses/*` — business form/table lose phone fields; business detail gains a "Números" section listing its `PhoneNumber`s.
- `src/app/(app)/admin/clients/[id]/businesses/new/page.tsx` — becomes two steps: create Business (WABA), then add numbers from the business detail; "Nuevo número" form now creates a `PhoneNumber` under a chosen business.
- `src/features/admin/components/client-businesses-table.tsx:58-60` — show number count / displayPhones per business row.
- Conversation list badge (`src/features/conversations/containers/conversation-list-pane-container.tsx:43-62`) — badge by `displayPhone` when the list spans >1 phone number (replaces the >1-business heuristic).
- Credential test picker (B7).

### Tests
- Central fixture `src/lib/__tests__/fixtures/ownership.ts:16-66` — `createTestBusiness` creates Business + one PhoneNumber; `createTestConversation` takes the phone number id and sets both FKs. This transparently re-exercises all 14 dependent suites.
- `src/lib/__tests__/message-handler*.test.ts` (4 files) — fixtures gain a `PhoneNumber` object; lookup mock moves from `business.findFirst` to `phoneNumber.findFirst`.
- `src/app/api/businesses/__tests__/*` — drop phone-field assertions; new suites for the phone-numbers routes (create, 409 duplicate, reparent rejection, admin-only, scope).
- New regression tests: media download uses resolved credential token (B1); two numbers in one WABA produce two separate conversations for the same customer (B3).

## 6. Delivery plan (chained PRs — this exceeds a 400-line single PR by far)

1. **PR 1 — schema + core routing.** Prisma models, expand migration, backfill script, contract migration, `message-handler` + `whatsapp.ts` + send route, fixture update, B1/B3/B6/B8. App fully works with existing UI reading businesses minus phone fields? No — Business API still returns old fields until PR 2, so PR 1 must keep the API response shape backward-compatible by joining the (single) phone number into the business payload. State this explicitly in the PR description.
2. **PR 2 — API + UI split.** Phone-number CRUD routes, businesses API cleanup, all UI changes, B7, conversation list filter/badge.
3. **PR 3 — cleanup.** Drop owner-fallback warn path if EventLog shows no hits, make `ownerId` required (D4), remove any compatibility joins from PR 1.

Each PR: work-unit commits, tests green (`npx vitest run`), no plaintext-token code paths reintroduced.

## 7. Manual steps (production)

1. Run the expand migration, then `prisma/scripts/migrate-phone-numbers.ts`, then the contract migration (in that order) against prod.
2. Verify in Supabase: every `Business` has exactly one `PhoneNumber`; every `Conversation.phoneNumberId` is non-null; no `Credential` duplicates were created.
3. No RLS changes are required (D2) — but re-run the Phase 5 RLS smoke checks after deploy to confirm realtime still respects tenant isolation.
4. Before PR 3: `select count(*) from "Business" where "ownerId" is null;` must be 0.
