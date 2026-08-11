export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  mediaType: string;
  sentBy: string; // "bot" | "human" | "customer"
  status: string; // "sent" | "delivered" | "read" | "failed"
  createdAt: string;
};

export type ConversationListItem = {
  id: string;
  customerPhone: string;
  customerName: string | null;
  nickname: string | null;
  status: string; // "active" | "handed_off" | "closed"
  lastMessageAt: string;
  unreadCount: number;
  business: { id: string; name: string };
  lastMessage: ConversationMessage | null;
};

/**
 * The stored rolling summary, as it arrives over JSON.
 *
 * Every field is optional here on purpose. The server validates and caps the
 * summary on write (src/lib/ai/summarize.ts), but the column is Prisma `Json`, so
 * a row can predate a schema change or have been written by hand. The client
 * cannot reuse the server validator — it reaches `node:crypto` through
 * `src/lib/prompt.ts` — so the display layer renders defensively instead of
 * trusting a shape it cannot verify.
 */
export type ConversationSummaryView = {
  customerName?: string | null;
  preferences?: string[];
  commitments?: string[];
  openItems?: string[];
  facts?: string[];
  notes?: string | null;
};

export type ConversationDetail = {
  id: string;
  customerPhone: string;
  customerName: string | null;
  nickname: string | null;
  status: string;
  summary: ConversationSummaryView | null;
  summarizedThroughAt: string | null;
  business: { id: string; name: string };
};

export type MessagesPage = {
  messages: ConversationMessage[];
  nextCursor: string | null;
};

/**
 * Envelope returned by `GET /api/conversations` (breaking change from a
 * bare array — pagination requires a `nextCursor`, and `multiBusiness`
 * can no longer be derived client-side from a partial page).
 */
export type ConversationsPage = {
  items: ConversationListItem[];
  nextCursor: string | null;
  // Only meaningful on the first page (no cursor); `false` on later pages.
  multiBusiness: boolean;
  scope: { admin: boolean; businessIds: string[] };
};

export type ConversationFilter = "all" | "bot" | "human" | "closed";

export type ConversationAppointment = {
  id: string;
  service: string;
  date: string;
  time: string;
  status: string; // "pending" | "confirmed" | "cancelled" | ...
  notes: string | null;
};
