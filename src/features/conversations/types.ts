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
  status: string; // "active" | "handed_off" | "closed"
  lastMessageAt: string;
  unreadCount: number;
  business: { id: string; name: string };
  lastMessage: ConversationMessage | null;
};

export type ConversationDetail = {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: string;
  business: { id: string; name: string };
};

export type MessagesPage = {
  messages: ConversationMessage[];
  nextCursor: string | null;
};

export type ConversationFilter = "all" | "bot" | "human" | "closed";
