"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { conversationKeys } from "@/features/conversations/query-keys";

const POLL_INTERVAL_MS = 5000;

/**
 * Tenant scope for the `Conversation`-table realtime channel. Only the list
 * pane passes this — the thread container omits it entirely so it never
 * opens a second, redundant table-wide channel (see
 * `shouldOpenConversationChannel`).
 *
 * `businessIds` is only consulted when `admin` is `false`; admin sessions
 * stay unfiltered by design regardless of its contents.
 */
export type ListScope = { admin: boolean; businessIds: string[] };

/**
 * Builds the Supabase `postgres_changes` filter string for INSERT/UPDATE
 * `Conversation` events.
 *
 * Returns `undefined` (no filter — unfiltered subscription) when:
 * - `listScope` is omitted (caller doesn't open the channel at all, so the
 *   value is unused, but keeping this pure and total avoids a footgun), or
 * - the session is an admin session (D8: admins see cross-tenant activity).
 *
 * DELETE events are NEVER filtered by this function — see the doc comment
 * on `useRealtimeMessages` for why (Postgres DELETE payloads under default
 * replica identity only carry the primary key, not `businessId`).
 */
export function buildConversationChangeFilter(
  listScope: ListScope | undefined,
): string | undefined {
  if (!listScope || listScope.admin) return undefined;
  return `businessId=in.(${listScope.businessIds.join(",")})`;
}

/**
 * The `Conversation`-table channel is opt-in: only a caller that passes a
 * `listScope` opens it. This is what de-duplicates the channel between the
 * list pane (passes `listScope`) and the thread container (omits it).
 */
export function shouldOpenConversationChannel(
  listScope: ListScope | undefined,
): boolean {
  return listScope !== undefined;
}

/**
 * Keeps the chat UI live without manual refresh via Supabase Realtime.
 *
 * - Subscribes to `Message` INSERT and UPDATE events for the active
 *   conversation (when `conversationId` is provided) and invalidates its
 *   messages query — UPDATE covers delivery-status ticks (sent/delivered/
 *   read/failed) changing live as WhatsApp posts status callbacks.
 * - Opens the `Conversation`-table channel ONLY when the caller passes
 *   `listScope` (see `shouldOpenConversationChannel`) — today only the list
 *   pane does; the thread container omits it so it never opens a second,
 *   redundant table-wide channel.
 * - When open, INSERT and UPDATE `Conversation` events are filtered by
 *   `businessId` for non-admin/tenant-scoped sessions (see
 *   `buildConversationChangeFilter`); admin sessions stay unfiltered by
 *   design (they intentionally see cross-tenant activity). DELETE is ALWAYS
 *   unfiltered for every session: under default replica identity, Postgres
 *   DELETE payloads only carry the primary key, not `businessId`, so a
 *   `businessId` filter on DELETE would silently never match.
 * - Never trusts the raw realtime payload shape — every event just triggers
 *   a refetch through the existing REST API, which stays the single source
 *   of truth.
 * - On reconnect (channel status `SUBSCRIBED` after having dropped),
 *   invalidates everything conversation-related to repair any events missed
 *   while disconnected.
 * - Fallback: if a channel reports `CHANNEL_ERROR`/`CLOSED`/`TIMED_OUT`,
 *   degrades to polling every 5s until the channel reports `SUBSCRIBED`
 *   again.
 * - Also invalidates everything whenever the tab regains visibility
 *   (`document.visibilitychange`), repairing anything missed while the tab
 *   was backgrounded/asleep and the browser throttled or dropped the
 *   websocket.
 *
 * NOTE: no blanket low-frequency safety poll runs anymore (removed — a
 * tenant-scoped realtime subscription bounds the per-tenant refetch cost,
 * making a platform-wide poll redundant overhead). The 5s degraded poll on
 * a dropped channel and the `visibilitychange` invalidation remain the sole
 * fallbacks for a genuinely dead channel.
 *
 * NOTE: this depends on Realtime being enabled for "Message"/"Conversation"
 * in the target Supabase project and RLS allowing the caller to read the
 * rows it is subscribed to. Neither can be exercised in this sandbox — see
 * docs/plan/PHASE5_MANUAL_STEPS.md for the manual verification checklist.
 */
export function useRealtimeMessages(
  conversationId?: string,
  listScope?: ListScope,
): void {
  const queryClient = useQueryClient();
  const hadDropRef = useRef(false);
  // The list pane and the open thread mount this hook simultaneously (list
  // stays mounted in the layout while a conversation is open) — each needs
  // its own Supabase channel. Reusing a fixed name makes the second
  // `.channel()` call return the already-`subscribe()`d instance, and
  // calling `.on()` on it throws synchronously ("cannot add
  // `postgres_changes` callbacks... after `subscribe()`"), crashing the
  // whole route. A per-instance suffix keeps the channels independent.
  // Lazy `useState` rather than `useRef(...).current`: reading a ref during
  // render is not allowed, and this value is only ever read, never mutated.
  const [instanceId] = useState(() => crypto.randomUUID());

  // Derived to stable primitives (not the `listScope` object itself) for the
  // effect's dependency array — `listScope` is commonly a freshly-computed
  // object literal from query data on every render, which would otherwise
  // tear down and reopen the channel on unrelated re-renders.
  const listScopeAdmin = listScope?.admin;
  const listScopeBusinessIdsKey = listScope?.businessIds.join(",");
  const hasListScope = listScope !== undefined;

  useEffect(() => {
    const supabase = createClient();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const invalidateMessages = () => {
      if (conversationId) {
        queryClient.invalidateQueries({
          queryKey: conversationKeys.messages(conversationId),
        });
      }
    };

    const invalidateList = () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    };

    const invalidateAll = () => {
      invalidateList();
      invalidateMessages();
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(invalidateAll, POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") invalidateAll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channels: RealtimeChannel[] = [];

    if (shouldOpenConversationChannel(listScope)) {
      const changeFilter = buildConversationChangeFilter(listScope);
      const conversationChannel = supabase
        .channel(`conversations-list-changes-${instanceId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "Conversation",
            ...(changeFilter ? { filter: changeFilter } : {}),
          },
          invalidateList,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "Conversation",
            ...(changeFilter ? { filter: changeFilter } : {}),
          },
          invalidateList,
        )
        .on(
          // DELETE is always unfiltered — see the doc comment above.
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "Conversation" },
          invalidateList,
        )
        .subscribe((status) => {
          handleStatus(status);
        });
      channels.push(conversationChannel);
    }

    let messageChannel: RealtimeChannel | null = null;
    if (conversationId) {
      messageChannel = supabase
        .channel(`conversation-${conversationId}-messages`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "Message",
            filter: `conversationId=eq.${conversationId}`,
          },
          invalidateMessages,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "Message",
            filter: `conversationId=eq.${conversationId}`,
          },
          invalidateMessages,
        )
        .subscribe((status) => {
          handleStatus(status);
        });
      channels.push(messageChannel);
    }

    function handleStatus(status: string) {
      if (status === "SUBSCRIBED") {
        stopPolling();
        if (hadDropRef.current) {
          hadDropRef.current = false;
          invalidateAll();
        }
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        hadDropRef.current = true;
        startPolling();
      }
    }

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
    // `listScope` itself is intentionally omitted: its derived primitives
    // (`hasListScope`/`listScopeAdmin`/`listScopeBusinessIdsKey`) are the
    // real dependencies — see the comment where they're computed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    conversationId,
    queryClient,
    instanceId,
    hasListScope,
    listScopeAdmin,
    listScopeBusinessIdsKey,
  ]);
}
