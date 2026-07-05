# AIbot v2 — Master Plan Overview

> **Audience**: implementing AI agents (e.g. Claude Sonnet) and human reviewers.
> **Evidence baseline**: all `file:line` references are valid at commit `1e2ecf9` (main).
> **Status**: planning complete, implementation not started.

## 1. What we are building

AIbot is a multi-business WhatsApp AI assistant (Next.js 16 App Router + Prisma 5 + Supabase Postgres + WhatsApp Cloud API, deployed on Railway). v2 turns the current unauthenticated CRUD panel into a production-grade product:

1. **Auth + multi-tenancy** — Google OAuth + email magic link (Supabase Auth). Each user owns businesses and sees only their own data.
2. **Zero-downtime provider/API-key management** — AI provider keys and WhatsApp tokens stored encrypted in DB, rotatable from the admin UI with no redeploy and no downtime.
3. **WhatsApp-like realtime chat UI** — two-pane conversation interface with live message updates (no manual refresh) and human takeover (pause bot, reply manually).
4. **Frontend restructure** — feature-based architecture, design system, fully responsive (mobile + desktop).
5. **Hardening** — webhook signature verification, delivery statuses, observability, rate limiting.

## 2. Current state (evidence)

| Area | State | Evidence |
|------|-------|----------|
| Auth | **None.** Every API route and page is public | `src/app/api/conversations/[id]/send/route.ts` (no session check), all of `src/app/api/**` |
| AI key | Single global `OPENAI_API_KEY` env var; changing it requires redeploy | `src/lib/openai.ts:8` |
| WhatsApp token | Plaintext per business in DB | `prisma/schema.prisma:16` (`Business.whatsappToken`) |
| Webhook | No signature verification; fire-and-forget error swallowing | `src/app/api/webhook/route.ts` |
| Takeover | Partially exists: `handed_off` status skips bot reply; manual send route works | `src/lib/message-handler.ts:81-91`, `src/app/api/conversations/[id]/handoff/route.ts`, `src/app/api/conversations/[id]/send/route.ts` |
| Realtime | None — UI uses `router.refresh()` after actions only | `src/components/conversation-view.tsx:43,61` |
| UI structure | Flat pages + ad-hoc components, dark-only, desktop-oriented | `src/app/*/page.tsx`, `src/components/*` |
| Frontend deps | next 16, react 18, tailwind 3, no UI library, no state/query library | `package.json:17-25` |
| Data model | `Business`, `Conversation`, `Message`, `Appointment` — no `User`, no ownership, no provider/credential models | `prisma/schema.prisma` |

Related prior work:
- **PR #1** (`docs/IMPROVEMENT_PLAN.md`): general scalability/fix audit. Still valid as a bug-fix reference; this plan supersedes its feature roadmap.
- **PR #2** (`worktree-multi-provider`): added `Business.provider` column + multi-provider via OpenAI SDK `baseURL`. **Do not merge as-is** — Phase 3 absorbs and supersedes it with credential-based provider resolution.

## 3. Target architecture decisions (locked)

These were decided with the product owner on 2026-07-05. Do not re-litigate them during implementation.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth provider | **Supabase Auth** (`@supabase/ssr`) with Google OAuth + email magic link | Already on Supabase; no extra service; magic link covers non-Google users |
| Tenancy model | **Multi-tenant**: `User` owns `Business`es via `ownerId`; every query scoped by owner | Prepares SaaS; single-team mode is just one user |
| Chat mode | **Human takeover**: admin can pause bot per conversation and send manual replies | Already half-built (`handed_off` status) |
| Realtime transport | **Supabase Realtime** (`postgres_changes` on `Message`/`Conversation`) | Messages are inserted server-side by the webhook; DB-level change feed reaches all clients with zero extra infra |
| Key storage | **Encrypted in DB** (AES-256-GCM, master key `APP_ENCRYPTION_KEY` in env), resolved per-request | Enables zero-downtime rotation from the UI; env vars require redeploy |
| Key rotation model | **Versioned credentials** with `active`/`standby`/`revoked` status; activate-before-revoke | No window where no valid key exists |
| UI library | **shadcn/ui** (Radix + Tailwind) + lucide-react icons | Unstyled-by-default, copy-in components, no runtime lock-in |
| Frontend architecture | **Feature folders** (`src/features/*`) + container/presentational split | Screaming architecture; features are discoverable by name |
| Data fetching (client) | **TanStack Query** for client mutations/queries + Supabase Realtime for live updates | Cache invalidation on realtime events; optimistic sends |
| UI language | **Spanish (es)** for user-facing copy (existing convention); **English** for code, identifiers, comments | Matches current codebase (`conversation-view.tsx` copy is Spanish) |

## 4. Phase map

```
Phase 1: Foundations & security   (blocks everything)
   └─> Phase 2: Auth & multi-tenancy   (blocks 3, 4, 5)
          ├─> Phase 3: Provider & key management
          └─> Phase 4: Frontend restructure & design system
                 └─> Phase 5: Realtime WhatsApp-style chat + takeover
                        └─> Phase 6: Hardening & extras
```

| Phase | File | Depends on | Rough size |
|-------|------|-----------|------------|
| 1. Foundations & security | `01-foundations.md` | — | 2–3 PRs |
| 2. Auth & multi-tenancy | `02-auth-multitenancy.md` | 1 | 2–3 PRs |
| 3. Provider & key management | `03-provider-key-management.md` | 2 | 2–3 PRs |
| 4. Frontend restructure | `04-frontend-restructure.md` | 2 | 2–3 PRs |
| 5. Realtime chat & takeover | `05-realtime-chat.md` | 4 (and 2) | 3–4 PRs |
| 6. Hardening & extras | `06-hardening-extras.md` | 5 | independent PRs |

Phases 3 and 4 are parallelizable after Phase 2 lands.

## 5. Conventions for implementing agents (MANDATORY)

1. **One PR per work unit**, target ≤ 400 changed lines (excluding lockfiles/generated). Each phase doc proposes PR boundaries — follow them.
2. **Conventional commits**, no AI attribution/Co-Authored-By trailers.
3. **Migrations**: every schema change ships as a Prisma migration (`prisma migrate dev --name <slug>`). Never edit applied migrations. The production DB is Supabase; migrations run with `DIRECT_URL`.
4. **Never break the webhook.** `POST /api/webhook` must stay publicly reachable (WhatsApp calls it) and must keep returning 200 fast. Any change touching `src/lib/message-handler.ts` or the webhook route must be manually smoke-tested with a simulated payload (see Phase 1 for the fixture).
5. **Secrets**: never log decrypted keys or tokens; render only `keyLast4` in UI and API responses.
6. **Testing**: Vitest is introduced in Phase 1. From then on, every lib-level behavior change needs a unit test; API routes need at least a happy-path + auth-rejection test.
7. **Acceptance criteria are the contract.** Each task in a phase doc lists them; a task is done only when all criteria pass.
8. **UI copy in Spanish, code in English** (see decision table).
9. **Do not introduce new runtime dependencies** beyond the ones each phase doc explicitly lists.

## 6. Environment variables (final state)

| Var | Introduced in | Purpose |
|-----|--------------|---------|
| `DATABASE_URL` / `DIRECT_URL` | existing | Pooled / direct Postgres |
| `WHATSAPP_VERIFY_TOKEN` | existing | Webhook GET verification |
| `WHATSAPP_APP_SECRET` | Phase 1 | Webhook signature verification |
| `OPENAI_API_KEY` | existing → **removed in Phase 3** | Legacy global key (fallback until credentials migrated) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 2 | Supabase Auth + Realtime (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 2 | Server-side auth admin ops |
| `APP_ENCRYPTION_KEY` | Phase 3 | 32-byte base64 master key for credential encryption |
