# Phase 5 — Manual Steps (Realtime Chat)

Everything in Phase 5 that depends on a real Supabase project (Realtime
replication, RLS enforcement, cross-tenant isolation) **cannot be exercised
in this sandbox** — there is no live Supabase project, only a plain local
Postgres. This document lists exactly what to verify by hand once the
migrations are applied to a real Supabase project.

## 1. Confirm the Realtime + RLS migration actually took effect

The migration `prisma/migrations/20260705112425_enable_realtime_and_rls/migration.sql`
is written to be a **safe no-op against plain Postgres** (verified locally —
`npx prisma migrate dev` applies it cleanly against the docker-compose
Postgres with zero effect) and to **only take effect against a real Supabase
database**, where:

- `pg_publication` already has a row named `supabase_realtime` (created by
  the Supabase platform itself), so the `ALTER PUBLICATION ... ADD TABLE`
  statements run.
- the `auth.uid()` function exists (part of Supabase's `auth` schema), so
  the RLS policies get created.

**After deploying to a real Supabase project, verify:**

1. Run `npx prisma migrate deploy` (or `migrate dev` in a dev branch) against
   the Supabase connection string.
2. In the Supabase dashboard → Database → Publications, confirm `"Message"`
   and `"Conversation"` appear under `supabase_realtime`. If for any reason
   the migration's guard skipped them (e.g. the publication didn't exist yet
   at migration time), enable Realtime manually for both tables from
   Database → Replication, or re-run:
   ```sql
   alter publication supabase_realtime add table "Message", "Conversation";
   ```
3. In Database → Policies, confirm both tables show RLS **enabled** with one
   SELECT policy each ("Conversation select by owner", "Message select by
   owner"). If the policies are missing (e.g. `auth.uid()` wasn't resolvable
   at migration time for some reason), re-run the `CREATE POLICY` statements
   from the migration file manually via the SQL editor.

## 2. Verify RLS actually isolates tenants (two-account test)

RLS only gates what Supabase **Realtime** and any **PostgREST/anon-key**
access can read — the app's own Prisma queries use the direct/service
connection and bypass RLS entirely (this is intentional and already
enforced at the application layer via `ownerId` checks in every route).
What RLS additionally protects against is a **leak through the Realtime
channel** if a browser client ever subscribed to a table it shouldn't see.

To verify:

1. Create two Supabase Auth users (User A, User B), each owning at least one
   `Business` with at least one `Conversation`.
2. Log in as User A in one browser (or profile), User B in another.
3. Open a conversation thread as User A. In the browser devtools console,
   confirm the Realtime subscription is scoped to `conversationId=eq.<A's id>`
   (see the `filter` passed in `use-realtime-messages.ts`).
4. As User B, trigger a new message on one of *User A's* conversations
   (e.g. via a test webhook call or manual send using User A's business,
   if you have direct DB/API access for the test). User A's open browser
   tab should **not** receive any Realtime event for it — the `Conversation`
   list-wide subscription in `use-realtime-messages.ts` currently has no
   server-side filter (Realtime can't filter cross-table joins), so this
   is exactly what RLS is for: even though the client subscribes broadly,
   Postgres/Realtime should only forward rows User A's role can `SELECT`.
5. Confirm User A's list does **not** reorder or badge-update from User B's
   conversation activity, and User A's thread does not receive User B's
   messages.

If step 4 leaks data, the RLS policies are not being applied to the
Realtime role (double-check the `authenticated`/`anon` role grants and that
the policies were actually created — see step 1.3).

## 3. Confirm Realtime works end-to-end (not just RLS)

1. Open a conversation thread as the owning admin.
2. Send a WhatsApp message to the connected number from a real phone.
3. Confirm the message appears in the open thread **without a manual
   refresh**, ideally within ~2 seconds.
4. Open the conversations list in a second browser window/tab (same
   account). Confirm it reorders to the top and the unread badge increments
   without a refresh.
5. In devtools, go offline (Network → Offline) for ~10s, then back online.
   Confirm the thread keeps updating afterward — this exercises the
   `CHANNEL_ERROR`/`CLOSED` → 5s polling fallback and the reconnect
   (`SUBSCRIBED` after a drop) full-invalidate in `use-realtime-messages.ts`.

## 4. Manual end-to-end checklist (human takeover)

- [ ] Send a WhatsApp message to the bot → it appears live in an open
      thread, list reorders, unread badge increments elsewhere.
- [ ] Toggle "Atención humana" (confirm the dialog) → bot stops replying to
      that customer (verify by sending another WhatsApp message and
      confirming no automated reply is sent, only persisted).
- [ ] Send a manual reply from the admin thread → it arrives on the
      customer's real phone, and the bubble shows the "👤 Tú" label.
- [ ] Toggle back to "Bot activo" → the bot resumes automatic replies.
- [ ] Mobile at ~360px width: list is full-screen at `/conversations`,
      tapping a conversation opens `/conversations/[id]` full-screen with a
      working back button, composer usable without layout breakage.
- [ ] If the last customer message is >24h old, the 24h-window banner shows
      in the thread header area.

## 5. Known local-sandbox limitations (context for the reviewer)

- `prisma migrate dev` was run against `postgresql://bot:testpass@localhost:55432/whatsapp_bot`
  (plain Postgres via docker-compose) — both new migrations applied
  successfully, and the Realtime/RLS migration confirmed as a documented
  no-op there (no `supabase_realtime` publication, no `auth.uid()`).
- The `use-realtime-messages.ts` hook's `postgres_changes` subscriptions and
  reconnect/polling-fallback logic are implemented against the real
  `@supabase/supabase-js` `channel().on().subscribe()` API and are believed
  correct per the SDK's documented behavior, but were **not** exercised
  against a live Supabase Realtime server in this sandbox (no such server
  available). Exercise section 3 above before considering this feature
  fully verified.
