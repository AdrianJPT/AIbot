# Phase 2 — Manual steps (Supabase dashboard + Google Cloud Console)

The code in this phase assumes Supabase Auth is configured with Google OAuth
and email magic link. None of this can be done from the agent's environment
(no dashboard/API credentials available) — the product owner must do the
following before auth works end-to-end.

## 1. Google Cloud Console — OAuth client

1. Create (or reuse) a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (get `<your-project-ref>` from the Supabase project settings).
3. Copy the generated **Client ID** and **Client secret** — you'll paste them
   into Supabase in the next step.

## 2. Supabase dashboard — Auth providers

In your Supabase project → **Authentication → Providers**:

1. **Google**: enable it, paste the Client ID / Client secret from step 1.
2. **Email**: enable it with **magic link (OTP)** on. Disable password
   sign-ups (Authentication → Providers → Email → toggle "Enable password
   sign-ups" off) — this app only supports Google + magic link, no passwords.

In **Authentication → URL Configuration**:

- **Site URL**: your production URL (Railway) — e.g. `https://your-app.up.railway.app`.
- **Redirect URLs**: add both
  - `http://localhost:3000/auth/callback` (local dev)
  - `https://your-app.up.railway.app/auth/callback` (production)

## 3. Environment variables

Set these in `.env` (local) and in Railway's environment variables (prod).
Values come from Supabase project **Settings → API**:

| Var | Where to find it |
|-----|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → Project API keys → `service_role` (**secret**, never expose client-side) |

`src/lib/env.ts` now requires all three at process start — the app will
refuse to boot without them (same as the existing `WHATSAPP_APP_SECRET`
pattern from Phase 1).

## 4. Local dev: reading magic-link emails

Supabase's hosted email sending in dev is rate-limited and slow. To grab the
magic-link URL directly instead of waiting for an email, use **Authentication
→ Logs** in the dashboard, or set up Inbucket if you're running Supabase
locally via the CLI.

## 5. First login + ownership backfill (do this once, after this PR is live)

Once the product owner logs in for the first time (Google or magic link), a
`User` row is created automatically (`src/lib/auth.ts`). All *existing*
businesses in the DB have `ownerId = null` at this point — they were created
before ownership existed.

Run the backfill script to assign them all to that user:

```bash
npx tsx prisma/scripts/assign-owner.ts --email owner@example.com
# or
npx tsx prisma/scripts/assign-owner.ts --user-id <supabase-uuid>
```

This is a one-off, manual step — it is **not** run automatically, and
`Business.ownerId` stays nullable until this has been done in every
environment (local, staging, prod). A follow-up migration to make `ownerId`
required is intentionally deferred to a later PR (see
`docs/plan/02-auth-multitenancy.md`, task 2.2) — only do that once you've
confirmed every business in every environment has an owner.

## Checklist

- [ ] Google OAuth client created, redirect URI set to Supabase's callback
- [ ] Google provider enabled in Supabase with client id/secret
- [ ] Email provider enabled, magic link on, password sign-ups off
- [ ] Site URL + redirect URLs configured (localhost + prod)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` set in local `.env` and Railway
- [ ] Product owner logged in once (creates their `User` row)
- [ ] `prisma/scripts/assign-owner.ts` run against every environment with
      existing ownerless businesses
