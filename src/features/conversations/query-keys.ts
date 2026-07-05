/**
 * Centralized TanStack Query keys for the conversations feature, shared
 * between data-fetching containers and the realtime hook (which invalidates
 * these same keys on Supabase Realtime events / polling fallback).
 */
export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  messages: (conversationId: string) =>
    [...conversationKeys.all, conversationId, "messages"] as const,
};
