"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ConversationList } from "@/features/conversations/components/conversation-list";
import { fetchConversations } from "@/features/conversations/api";
import { useRealtimeMessages } from "@/features/conversations/hooks/use-realtime-messages";
import { conversationKeys } from "@/features/conversations/query-keys";
import type { ConversationFilter } from "@/features/conversations/types";

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
  const phoneNumberId = searchParams.get("phoneNumberId") ?? undefined;
  // Only trust `label` when a phoneNumberId filter is actually active —
  // otherwise a URL with just `?label=...` would show a "viewing X" banner
  // over an unfiltered list.
  const numberFilterLabel = phoneNumberId ? searchParams.get("label") ?? undefined : undefined;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");

  // Live-reorders the list and refreshes unread badges as Conversation rows
  // change (new messages bump lastMessageAt/unreadCount server-side).
  useRealtimeMessages();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: [...conversationKeys.list(debouncedSearch), phoneNumberId],
    queryFn: () => fetchConversations(debouncedSearch, phoneNumberId),
  });

  const businessCount = useMemo(
    () => new Set(conversations.map((c) => c.business.id)).size,
    [conversations]
  );

  const filtered = useMemo(() => {
    const wantedStatus = STATUS_BY_FILTER[filter];
    if (!wantedStatus) return conversations;
    return conversations.filter((c) => c.status === wantedStatus);
  }, [conversations, filter]);

  return (
    <ConversationList
      conversations={filtered}
      activeId={activeId}
      search={search}
      onSearchChange={setSearch}
      filter={filter}
      onFilterChange={setFilter}
      showBusinessBadge={businessCount > 1}
      numberFilterLabel={numberFilterLabel}
      loading={isLoading}
    />
  );
}
