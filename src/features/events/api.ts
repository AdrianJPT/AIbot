import type { EventFilters, EventsPage } from "@/features/events/types";

export function fetchEvents(
  filters: EventFilters,
  cursor?: string | null,
  limit = 25
): Promise<EventsPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters.level) params.set("level", filters.level);
  if (filters.source) params.set("source", filters.source);
  if (cursor) params.set("cursor", cursor);

  return fetch(`/api/events?${params}`).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Error");
    }
    return res.json();
  });
}
