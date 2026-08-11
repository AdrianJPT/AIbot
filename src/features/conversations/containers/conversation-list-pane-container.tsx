"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ConversationList } from "@/features/conversations/components/conversation-list";
import { fetchConversations } from "@/features/conversations/api";
import { fetchBusinesses, fetchPhoneNumbers } from "@/features/businesses/api";
import { useRealtimeMessages } from "@/features/conversations/hooks/use-realtime-messages";
import { conversationKeys } from "@/features/conversations/query-keys";
import type { ConversationFilter } from "@/features/conversations/types";

const PAGE_SIZE = 20;

const STATUS_BY_FILTER: Record<ConversationFilter, string | null> = {
  all: null,
  bot: "active",
  human: "handed_off",
  closed: "closed",
};

const SEARCH_DEBOUNCE_MS = 300;

export function ConversationListPaneContainer() {
  const pathname = usePathname();
  const activeId = pathname.match(/^\/conversations\/([^/]+)/)?.[1];

  const searchParams = useSearchParams();
  const initialPhoneNumberId = searchParams.get("phoneNumberId") ?? undefined;
  // Only trust `label` when a phoneNumberId filter is actually active —
  // otherwise a URL with just `?label=...` would show a "viewing X" banner
  // over an unfiltered list.
  const numberFilterLabel = initialPhoneNumberId
    ? (searchParams.get("label") ?? undefined)
    : undefined;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  // Business/number filters are seeded once from the URL (deep links from
  // the client businesses table and per-number links) but don't write back
  // to it — the selects below just take over from there.
  const [businessId, setBusinessId] = useState<string | undefined>(
    () => searchParams.get("businessId") ?? undefined,
  );
  const [phoneNumberId, setPhoneNumberId] = useState<string | undefined>(
    initialPhoneNumberId,
  );

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  const { data: businesses = [] } = useQuery({
    queryKey: ["businesses"],
    queryFn: fetchBusinesses,
  });

  // Cascades from the business select: only fetched once a business is
  // chosen, so the number select's options narrow to that business's numbers.
  const { data: phoneNumbers = [] } = useQuery({
    queryKey: ["phoneNumbers", businessId],
    queryFn: () => fetchPhoneNumbers(businessId!),
    enabled: !!businessId,
  });

  const status = STATUS_BY_FILTER[filter];

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: conversationKeys.list({
        search: debouncedSearch,
        status,
        businessId,
        phoneNumberId,
      }),
      queryFn: ({ pageParam }) =>
        fetchConversations({
          q: debouncedSearch,
          businessId,
          phoneNumberId,
          status,
          cursor: pageParam as string | null,
          limit: PAGE_SIZE,
        }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

  // Live-reorders the list and refreshes unread badges as Conversation rows
  // change (new messages bump lastMessageAt/unreadCount server-side). This
  // container owns the `Conversation`-table realtime channel — passing
  // `listScope` is what opens it (the thread container omits it so it never
  // opens a duplicate). `scope` comes from the first loaded page; the
  // channel opens once it's available, then stays scoped to it (or
  // unfiltered for admins) for the life of this component.
  useRealtimeMessages(undefined, data?.pages[0]?.scope);

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // Server computes this only on the first page (no cursor) — see
  // ConversationsPage.multiBusiness.
  const showBusinessBadge = data?.pages[0]?.multiBusiness ?? false;

  return (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      search={search}
      onSearchChange={setSearch}
      filter={filter}
      onFilterChange={setFilter}
      showBusinessBadge={showBusinessBadge}
      numberFilterLabel={numberFilterLabel}
      loading={isLoading}
      hasMore={Boolean(hasNextPage)}
      loadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      businesses={businesses}
      businessId={businessId}
      onBusinessIdChange={(id) => {
        setBusinessId(id);
        // Picking a different business invalidates whatever number was
        // selected under the previous one.
        setPhoneNumberId(undefined);
      }}
      phoneNumbers={phoneNumbers}
      phoneNumberId={phoneNumberId}
      onPhoneNumberIdChange={setPhoneNumberId}
    />
  );
}
