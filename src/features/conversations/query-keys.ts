/**
 * Centralized TanStack Query keys for the conversations feature, shared
 * between data-fetching containers and the realtime hook (which invalidates
 * these same keys on Supabase Realtime events / polling fallback).
 */
export const conversationKeys = {
  all: ["conversations"] as const,
  // `search` is omitted for invalidation call sites (realtime hook, mutations)
  // — TanStack matches by key prefix, so ["conversations","list"] still
  // invalidates every ["conversations","list",<search>] query.
  list: (search?: string) =>
    [...conversationKeys.all, "list", ...(search ? [search] : [])] as const,
  messages: (conversationId: string) =>
    [...conversationKeys.all, conversationId, "messages"] as const,
};
