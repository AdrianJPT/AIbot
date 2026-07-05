"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchEvents } from "@/features/events/api";
import { EventFiltersBar } from "@/features/events/components/event-filters";
import { EventTable } from "@/features/events/components/event-table";
import type { EventFilters, EventsPage } from "@/features/events/types";

export function EventsPanelContainer({
  initialEvents,
}: {
  initialEvents: EventsPage;
}) {
  const [filters, setFilters] = useState<EventFilters>({});

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useInfiniteQuery({
      queryKey: ["events", filters],
      queryFn: ({ pageParam }) =>
        fetchEvents(filters, pageParam as string | null),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // Only reuse the server-rendered first page when no filter is active —
      // as soon as the admin picks a filter, refetch from the API.
      ...(Object.keys(filters).length === 0 && {
        initialData: { pages: [initialEvents], pageParams: [null] },
      }),
    });

  const events = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.events),
    [data]
  );

  return (
    <div className="space-y-4">
      <EventFiltersBar filters={filters} onChange={setFilters} />

      <div className="rounded-lg border border-border bg-card">
        {isFetching && events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando…
          </p>
        ) : (
          <EventTable events={events} />
        )}
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      )}
    </div>
  );
}
