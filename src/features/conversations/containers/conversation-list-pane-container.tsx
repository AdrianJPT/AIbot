"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
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

export function ConversationListPaneContainer() {
  const pathname = usePathname();
  const activeId = pathname.match(/^\/conversations\/([^/]+)/)?.[1];

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");

  // Live-reorders the list and refreshes unread badges as Conversation rows
  // change (new messages bump lastMessageAt/unreadCount server-side).
  useRealtimeMessages();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: conversationKeys.list(),
    queryFn: fetchConversations,
  });

  const businessCount = useMemo(
    () => new Set(conversations.map((c) => c.business.id)).size,
    [conversations]
  );

  const filtered = useMemo(() => {
    const wantedStatus = STATUS_BY_FILTER[filter];
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (wantedStatus && c.status !== wantedStatus) return false;
      if (!term) return true;
      const name = (c.customerName || "").toLowerCase();
      return name.includes(term) || c.customerPhone.toLowerCase().includes(term);
    });
  }, [conversations, filter, search]);

  return (
    <ConversationList
      conversations={filtered}
      activeId={activeId}
      search={search}
      onSearchChange={setSearch}
      filter={filter}
      onFilterChange={setFilter}
      showBusinessBadge={businessCount > 1}
      loading={isLoading}
    />
  );
}
