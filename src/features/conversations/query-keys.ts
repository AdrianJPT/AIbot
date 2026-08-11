/**
 * Centralized TanStack Query keys for the conversations feature, shared
 * between data-fetching containers and the realtime hook (which invalidates
 * these same keys on Supabase Realtime events / polling fallback).
 */
export type ConversationListFilters = {
  search?: string;
  status?: string | null;
  businessId?: string;
  phoneNumberId?: string;
};

export const conversationKeys = {
  all: ["conversations"] as const,
  // `filters` is omitted for invalidation call sites (realtime hook,
  // mutations) — TanStack matches by key prefix, so ["conversations","list"]
  // still invalidates every ["conversations","list",<filters>] query.
  list: (filters?: ConversationListFilters) =>
    [...conversationKeys.all, "list", ...(filters ? [filters] : [])] as const,
  messages: (conversationId: string) =>
    [...conversationKeys.all, conversationId, "messages"] as const,
};
