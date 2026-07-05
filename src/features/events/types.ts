export type EventLogEntry = {
  id: string;
  level: string; // "error" | "warn" | "info"
  source: string; // "webhook" | "ai" | "whatsapp-send" | "auth" | "credentials" | ...
  message: string;
  detail: unknown;
  businessId: string | null;
  createdAt: string | Date;
};

export type EventsPage = {
  events: EventLogEntry[];
  nextCursor: string | null;
};

export type EventFilters = {
  level?: string;
  source?: string;
};
