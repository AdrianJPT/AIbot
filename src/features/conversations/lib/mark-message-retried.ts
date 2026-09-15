import type { MessagesPage } from "@/features/conversations/types";

/**
 * Pure helper: flips `retried:true` on the message with the given id across
 * an infinite query's cached pages, leaving everything else untouched.
 * Extracted so the "flag the original bubble as already retried the moment
 * its retry succeeds" logic (retry-duplicate-and-visible-cause defect 1) is
 * testable without mocking React Query — the server's next `retries`
 * include would eventually catch up on refetch, but the client patches its
 * own cache immediately so a second operator can't click a stale enabled
 * "Reintentar" before that refetch happens.
 */
export function markMessageRetried(
  pages: MessagesPage[],
  id: string,
): MessagesPage[] {
  return pages.map((page) => ({
    ...page,
    messages: page.messages.map((m) =>
      m.id === id ? { ...m, retried: true } : m,
    ),
  }));
}
