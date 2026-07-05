# Phase 2 — Auth & Multi-tenancy

> Depends on: Phase 1. Blocks: Phases 3, 4, 5.
> Goal: Google OAuth + email magic link + email/password via Supabase Auth, all offered together; every business belongs to a user; every page and API route enforces ownership. The webhook remains public (protected by signature from Phase 1).

## Decisions (locked)

- **Supabase Auth** with `@supabase/ssr` (cookie-based sessions in Next.js App Router). Providers: Google OAuth + email magic link (OTP) + email/password — all three shown together on the login screen. No Apple in this phase.
- **Ownership model**: `Business.ownerId → User.id`. Single owner per business for now; the schema leaves room for a future `Membership` table (do NOT build it now).
- **App-level access control** (Prisma `where` scoping), not Postgres RLS for admin queries — Prisma connects with a privileged role anyway. RLS is configured ONLY for Supabase Realtime reads in Phase 5.

## New dependencies

`@supabase/supabase-js`, `@supabase/ssr`.

## Tasks

### 2.1 Supabase Auth configuration (manual/dashboard steps — document in PR description)

- Enable Google provider in Supabase Auth (OAuth client in Google Cloud Console; redirect URL `https://<project>.supabase.co/auth/v1/callback`).
- Enable Email provider with magic link (OTP) AND password sign-ups on (login screen offers both).
- Set Site URL + additional redirect URLs (Railway prod URL, `http://localhost:3000`).
- New envs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Add to `src/lib/env.ts`.

### 2.2 User model + ownership migration

```prisma
model User {
  id         String     @id            // Supabase auth.users.id (uuid)
  email      String     @unique
  name       String?
  avatarUrl  String?
  businesses Business[]
  createdAt  DateTime   @default(now())
}
```
- Add to `Business`: `ownerId String?` + relation + `@@index([ownerId])`. Nullable at first: existing rows have no owner.
- Backfill strategy: after the first login of the product owner, a one-off script (`prisma/scripts/assign-owner.ts`, run with `tsx`) assigns all ownerless businesses to that user. Then a follow-up migration makes `ownerId` required.

### 2.3 Supabase client helpers

- `src/lib/supabase/server.ts` — `createServerClient` bound to Next.js cookies (per `@supabase/ssr` docs).
- `src/lib/supabase/client.ts` — browser client singleton.
- `src/lib/auth.ts` — `getSessionUser()`: reads the Supabase session server-side, upserts the `User` row (id/email/name/avatar from session) on first sight, returns it. Returns `null` when unauthenticated. This is the ONLY entry point routes/pages use.

### 2.4 Login flow

- `src/app/login/page.tsx` — public page: "Continuar con Google" button + email input for magic link. Spanish copy. Redirect target: `/`.
- `src/app/auth/callback/route.ts` — exchanges the OAuth/OTP code for a session (`supabase.auth.exchangeCodeForSession`), redirects to `/`.
- Logout: server action or route handler calling `supabase.auth.signOut()`, button in the sidebar.

### 2.5 Route protection

- `src/middleware.ts` — refreshes the Supabase session cookie (per `@supabase/ssr` pattern) and redirects unauthenticated requests to `/login`. Matcher excludes: `/login`, `/auth/*`, `/api/webhook`, static assets.
- Every API route under `src/app/api/**` (except webhook): start with `const user = await getSessionUser(); if (!user) return 401`.

### 2.6 Ownership scoping (the critical task)

Every Prisma query in pages and API routes must be scoped:

- Businesses: `where: { ownerId: user.id }` — `src/app/api/businesses/*`, `src/app/businesses/*`.
- Conversations/Appointments: scope through the relation, e.g. `where: { business: { ownerId: user.id } }` — `src/app/api/conversations/*`, `src/app/api/appointments/*`, corresponding pages.
- Detail routes (`[id]`): fetch with the ownership filter; 404 (not 403) when not found/not owned, to avoid resource-existence leaks.
- `send` and `handoff` routes (`src/app/api/conversations/[id]/send/route.ts:16-19`, `.../handoff/route.ts`): same scoping — today they operate on ANY conversation by id.
- Business creation sets `ownerId: user.id`.

**Do not scope**: `src/lib/message-handler.ts` (webhook path has no user context — it resolves the business by `phoneNumberId`, which is correct).

### 2.7 Tests

- `getSessionUser` mocked in route tests: unauthenticated → 401; authenticated non-owner → 404 on detail routes; owner → 200.
- At minimum cover: businesses list/create, conversation detail, send, handoff.

## PR slicing

1. **PR A**: 2.2 (schema) + 2.3 + 2.4 + 2.5 (login works, pages gated) — feature-flag ownership checks off until backfill.
2. **PR B**: 2.6 + 2.7 (scoping + tests) + backfill script + `ownerId` required migration.

## Gotchas

- `@supabase/ssr` requires the middleware cookie-refresh pattern or sessions die silently — follow the official Next.js App Router guide exactly.
- Supabase user id is a UUID string; `User.id` has no `@default` on purpose (it mirrors auth).
- Magic link emails in dev: use the Supabase dashboard "Auth → Logs" or inbucket to grab links.
- Do not cache `getSessionUser` across requests; call per request.

## Verification checklist

- [ ] Anonymous visit to `/` redirects to `/login`; webhook still publicly reachable.
- [ ] Google login and magic-link login both create/upsert a `User` row and land on the dashboard.
- [ ] User A cannot read or mutate user B's businesses/conversations/appointments (404).
- [ ] All existing businesses assigned an owner; `ownerId` non-nullable.
- [ ] CI green.
