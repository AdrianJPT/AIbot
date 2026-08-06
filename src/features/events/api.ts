import type { EventFilters, EventsPage } from "@/features/events/types";
import { requestJson } from "@/lib/api-client";

export function fetchEvents(
  filters: EventFilters,
  cursor?: string | null,
  limit = 25,
): Promise<EventsPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters.level) params.set("level", filters.level);
  if (filters.source) params.set("source", filters.source);
  if (cursor) params.set("cursor", cursor);

  return requestJson<EventsPage>(`/api/events?${params}`);
}
