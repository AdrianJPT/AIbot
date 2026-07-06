# Phase 2 — Manual steps (Supabase dashboard + Google Cloud Console)

The code in this phase assumes Supabase Auth is configured with Google OAuth,
email magic link, **and** email/password sign-in — all three are shown
together on the login screen, not as alternatives. None of this can be done
from the agent's environment (no dashboard/API credentials available) — the
product owner must do the following before auth works end-to-end.

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
2. **Email**: enable it with **magic link (OTP)** on, and also keep
   **"Enable password sign-ups"** on (Authentication → Providers → Email) —
   the login screen offers Google, magic link, and email/password side by
   side, so users can pick whichever they prefer.
3. If your Supabase project requires email confirmation before granting a
   session (Authentication → Providers → Email → "Confirm email"), the
   password sign-up flow shows a "check your email to confirm" message and
   waits for that click, same as the magic-link flow. You can turn "Confirm
   email" off for faster local testing, but keep it on in production.

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
| `NEXT_PUBLIC_SITE_URL` | Your public app domain (Railway's public domain in prod, `http://localhost:3000` locally) — **not** the internal `0.0.0.0:<port>` address Railway shows in its Networking tab |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → Project API keys → `service_role` (**secret**, never expose client-side) |

Auth redirects (`/auth/callback`, `/auth/logout`, the middleware's unauthenticated redirect) use `NEXT_PUBLIC_SITE_URL` instead of the incoming request's URL. Behind Railway's proxy, `req.nextUrl.origin` resolves to the container's internal bind address (e.g. `http://0.0.0.0:8080`) instead of the public domain, which sends users to an unreachable URL right after Google OAuth consent.

`src/lib/env.ts` now requires all three at process start — the app will
refuse to boot without them (same as the existing `WHATSAPP_APP_SECRET`
pattern from Phase 1).

## 4. Local dev: reading magic-link emails

Supabase's hosted email sending in dev is rate-limited and slow. To grab the
magic-link URL directly instead of waiting for an email, use **Authentication
→ Logs** in the dashboard, or set up Inbucket if you're running Supabase
locally via the CLI.

## 5. First login + ownership backfill — superseded

> **Update (docs/plan/07-waba-phone-numbers.md):** `Business.ownerId` is now
> required at the schema level (migration
> `20260706080000_business_owner_required`). Rather than backfill ownerless
> rows, every environment's data was wiped and started fresh instead, so
> `prisma/scripts/assign-owner.ts` (referenced below) was deleted as
> obsolete — it can never find a null-`ownerId` row again, since Postgres
> now rejects one outright. If you're following this checklist against a
> *different* environment that still has legacy ownerless businesses, either
> backfill them by hand before applying that migration, or wipe that
> environment too.

## Checklist

- [ ] Google OAuth client created, redirect URI set to Supabase's callback
- [ ] Google provider enabled in Supabase with client id/secret
- [ ] Email provider enabled, magic link on, password sign-ups **on**
- [ ] Site URL + redirect URLs configured (localhost + prod)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` set in local `.env` and Railway
- [ ] Product owner logged in once (creates their `User` row)
- [x] `Business.ownerId` required — resolved by wiping data instead of a
      backfill script (see note above)
