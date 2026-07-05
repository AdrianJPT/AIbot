# Phase 5 — Realtime WhatsApp-Style Chat + Human Takeover

> Depends on: Phase 4 (shell/design system) and Phase 2 (auth). Phase 3 recommended first (manual sends use resolved WhatsApp credentials).
> Goal: the flagship screen. A WhatsApp-like two-pane chat where messages appear live (no manual refresh), and the admin can pause the bot and reply as a human.

## What already exists (build on it, don't duplicate)

- `Conversation.status` supports `active | handed_off | closed`; webhook already skips bot replies when `handed_off` (`src/lib/message-handler.ts:81-91`).
- `POST /api/conversations/[id]/handoff` toggles status; `POST /api/conversations/[id]/send` sends manual WhatsApp text + persists it as `role:"assistant"`.

## Data model changes

```prisma
// Message additions
sentBy    String  @default("bot")   // "bot" | "human" | "customer"
status    String  @default("sent")  // "sent" | "delivered" | "read" | "failed"  (statuses wired in Phase 6)
// Conversation additions
lastMessageAt   DateTime @default(now())   // denormalized for list ordering — set on every message insert
unreadCount     Int      @default(0)       // customer messages since admin last opened the thread
customerName    String?                     // WhatsApp profile name from webhook `contacts[0].profile.name`
```
- Backfill migration: `sentBy = "customer"` where `role = "user"`, else `"bot"`; `lastMessageAt` from latest message.
- Webhook (`handleOneMessage`): set `customerName`, bump `lastMessageAt` + `unreadCount` on the conversation in the same transaction as the message insert. Manual send route sets `sentBy:"human"`.
- New route `POST /api/conversations/[id]/read` → zeroes `unreadCount`.

## Realtime transport — Supabase Realtime

Messages are inserted by the webhook (server), so clients need a DB change feed:

1. **Enable Realtime** on `"Message"` and `"Conversation"` tables (Supabase dashboard or migration: `alter publication supabase_realtime add table "Message", "Conversation";`). Prisma-created tables are case-sensitive — quote them.
2. **RLS for realtime reads** (Realtime respects RLS; Prisma's direct connection bypasses it, so app queries are unaffected):
   - Enable RLS on `"Message"` and `"Conversation"` with SELECT policies resolving ownership: conversation → business → `ownerId = auth.uid()::text`. Write policies: none (deny) — all writes go through Prisma.
   - Ship as a SQL migration; test that the admin panel still works afterwards (it will — Prisma uses the direct/pooled connection, not PostgREST).
3. **Client hook** `features/conversations/hooks/use-realtime-messages.ts`:
   - Subscribes via `supabase.channel(...).on("postgres_changes", { event: "INSERT", schema: "public", table: "Message", filter: "conversationId=eq.<id>" }, cb)`.
   - On event → `queryClient.invalidateQueries(["messages", conversationId])` (refetch through the API keeps one source of truth; do NOT trust the raw payload shape).
   - A second subscription on `"Conversation"` UPDATE events feeds the conversation list (reordering, unread badges).
   - On reconnect (`SUBSCRIBED` after drop) → invalidate everything chat-related. **Fallback**: if the channel errors, degrade to 5s polling and show nothing to the user (silent resilience).

## UI — `/conversations` becomes the chat screen

### Layout
- **Desktop (`md+`)**: two panes. Left: conversation list (~360px). Right: active thread. Empty state on the right when nothing selected ("Elegí una conversación").
- **Mobile**: list full-screen; tapping opens the thread full-screen with a back header. Use routes (`/conversations` + `/conversations/[id]`) so back button works natively.

### Conversation list (left pane)
- Each item: avatar circle (initials from `customerName` ?? phone), name/phone, business badge (when the user owns >1 business), last message preview (1 line, truncated), relative time, unread count badge, status chip for `handed_off` ("Atención humana") .
- Ordered by `lastMessageAt` desc; live-reorders via the Conversation subscription. Search input filters by name/phone client-side. Filter tabs: Todas / Bot / Humano / Cerradas.

### Thread (right pane)
- Header: customer name + phone, business name, **bot/human toggle** (prominent switch: "Bot activo" ↔ "Atención humana" → calls existing handoff route; confirmation dialog when pausing the bot).
- Messages: WhatsApp-style bubbles — customer left (neutral surface), bot/human right (emerald tint); `sentBy:"human"` bubbles get a small "👤 Tú" label to distinguish from bot. Date separators ("Hoy", "Ayer", date). Media placeholders per `mediaType` (🖼/🎙/📍 with content text). Auto-scroll to bottom on new message unless user has scrolled up (then show "↓ Nuevos mensajes" pill).
- Composer: sticky bottom textarea (Enter sends, Shift+Enter newline), send button. **Optimistic send**: append pending bubble immediately (clock icon) → reconcile on mutation success/failure (failed → red retry state). Composer visible in both modes; when bot is active, sending shows a hint that the reply was sent as a manual intervention.
- Opening a thread fires the `read` route and zeroes the unread badge.
- **24h window notice**: if last customer message is older than 24h, show a non-blocking banner ("Fuera de la ventana de 24h de WhatsApp — el mensaje puede ser rechazado") — template-message support is out of scope.

### Messages API
- `GET /api/conversations/[id]/messages?cursor=&limit=50` — cursor pagination (by `createdAt,id` desc), owner-scoped. Thread loads latest page; "load older" on scroll-top.

## Tests

- Webhook transaction updates `lastMessageAt`/`unreadCount`/`customerName` (fixture-driven).
- `handed_off` conversations: customer message persisted, no AI call, no bot send (already half-covered in Phase 1 — extend).
- Messages pagination + ownership.
- Component test (optional, only if cheap): optimistic send reconcile.

## PR slicing

1. **PR A**: schema additions + webhook/list/read/messages API + tests.
2. **PR B**: Realtime enablement + RLS migration + client hook (behind the existing UI).
3. **PR C**: chat layout — list pane + thread rendering (read-only, live).
4. **PR D**: composer + optimistic send + takeover toggle UX + 24h banner.

## Verification checklist

- [ ] Send a WhatsApp message to the bot → it appears in an open thread in <2s without any refresh; list reorders and badge increments in another browser window.
- [ ] Toggle "Atención humana" → bot stops replying (verified end-to-end), admin reply arrives on the customer's phone, bubble shows human label.
- [ ] User A receives no realtime events for user B's conversations (RLS verified with two accounts).
- [ ] Mobile: full flow usable at 360px (list → thread → back).
- [ ] Realtime channel killed (devtools offline) → polling fallback keeps thread updating; recovery on reconnect.
