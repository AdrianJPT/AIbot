# Phase 6 — Hardening & Extras

> Depends on: Phase 5. These items are independent of each other — each is its own small PR, prioritized top to bottom. Implement on demand; none blocks the others.

## 6.1 Message delivery statuses (recommended first — completes the chat UX)

WhatsApp posts status updates (`sent`/`delivered`/`read`/`failed`) to the same webhook under `value.statuses[]`, keyed by `wamid`.

- Persist outbound `wamid`: capture the message id from the Graph API send response (`messages[0].id`) in `sendMessage` (`src/lib/whatsapp.ts`) and store it on the outbound `Message` row.
- Webhook: handle `value.statuses[]` → update `Message.status` by `wamid`. `failed` statuses include an error object → log to `EventLog` and mark the bubble.
- UI: WhatsApp-style ticks on outbound bubbles (✓ sent, ✓✓ delivered, blue ✓✓ read, red ! failed) driven by the existing Message realtime subscription (extend to UPDATE events).

**Verify**: send manual message → ticks progress live as the customer receives/reads it.

## 6.2 Events/errors screen — `/settings/events`

- Paginated `EventLog` viewer (Phase 1 model): level/source filters, businessId filter, JSON detail expander. Owner-scoped: only events whose `businessId` belongs to the user (global-null events visible to all owners of affected… keep simple: show only rows with the user's businessIds).
- Dashboard card: errors in last 24h with link here.

**Verify**: force an AI failure → row visible with detail.

## 6.3 Webhook rate limiting & abuse control

- Per-conversation throttle in `handleOneMessage`: if a customer sends > N messages (default 10) in 60s, persist them but skip AI generation for the excess and log a `warn`. Simple DB count query — no Redis; single-replica Railway makes in-memory viable but DB-count survives restarts.
- Per-business daily AI-call budget: `Business.dailyAiLimit Int @default(1000)`; count via `EventLog` or a cheap counter column; when exceeded, reply with a configurable "estamos recibiendo muchos mensajes" text once and log.

**Verify**: fixture flood → excess messages stored, AI called ≤ N times.

## 6.4 Conversation search & export

- Server-side search: `GET /api/conversations?q=` matching `customerName`/`customerPhone` (move the Phase 5 client-side filter here when conversation count grows) + message-content search with Postgres `ILIKE` (index `Message.content` with `pg_trgm` if slow).
- Export conversation as `.txt` (WhatsApp export format) from the thread header menu.

## 6.5 Business-hours awareness & auto-handoff

- `Business.businessInfo` JSON already carries free-form info; add structured optional fields on Business: `timezone String?`, `autoHandoffKeywords String[]` (e.g. "hablar con humano", "agente").
- When a customer message matches a keyword → auto-set `handed_off`, notify (6.6), and reply with a configurable handoff message.

**Verify**: keyword fixture → conversation flips to `handed_off`, bot silent afterwards.

## 6.6 Notifications

- In-app: sonner toast + sidebar badge when a conversation enters `handed_off` (realtime Conversation subscription already delivers the event).
- Web Push (optional, bigger): service worker + `web-push` VAPID; subscribe from settings; notify on handoff and on first customer message of a new conversation. Only implement when explicitly requested.

## 6.7 PWA polish

- `manifest.json` (name, icons, `display: standalone`, theme colors both schemes), apple-touch-icon, viewport/theme-color meta. Makes the mobile chat installable — cheap win after Phase 5.
- No offline caching of API data (realtime app; stale cache is worse than a spinner).

## 6.8 Appointment ↔ chat integration

- Thread header: "Citas" button showing the customer's appointments (they're already linked by `conversationId` — `prisma/schema.prisma:57`).
- Appointment cards inline in the thread when the bot creates one (render a system bubble).

## 6.9 Ops

- `GET /api/health`: liveness probe for Railway healthcheck (`railway.json`). Keep it independent from Prisma and the DB so deploys can turn healthy even if the database is warming up.
- Prisma connection review under Realtime load: ensure `DATABASE_URL` uses the Supabase pooler (transaction mode) and `DIRECT_URL` only for migrations (already split per commit `68b2980` — verify config still matches).
- Backup note: enable Supabase PITR or scheduled dumps before real customer volume.

## Explicit non-goals (do not build without a new decision)

- WhatsApp template messages / outbound campaigns.
- Voice replies (TTS), payments, multi-agent team inboxes with assignment.
- Migrating off Railway or off Prisma.
- Native iOS/Android apps — the PWA (6.7) is the mobile story; Apple Sign-In was explicitly deferred.
