"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { conversationKeys } from "@/features/conversations/query-keys";

const POLL_INTERVAL_MS = 5000;
// Prod symptom: Supabase Realtime sometimes reports `SUBSCRIBED` on a
// channel while never actually delivering events ("tenant has no connected
// users" stretches in the Realtime logs) — the socket looks healthy from
// the client's perspective but nothing arrives. A slow background poll
// papers over that even when we believe we're connected, so the list can
// never get permanently stuck stale.
const SAFETY_POLL_INTERVAL_MS = 30_000;

/**
 * Keeps the chat UI live without manual refresh via Supabase Realtime.
 *
 * - Subscribes to `Message` INSERT and UPDATE events for the active
 *   conversation (when `conversationId` is provided) and invalidates its
 *   messages query — UPDATE covers delivery-status ticks (sent/delivered/
 *   read/failed) changing live as WhatsApp posts status callbacks.
 * - Always subscribes to ALL `Conversation` events (INSERT/UPDATE/DELETE)
 *   and invalidates the conversations list query — INSERT so a brand-new
 *   conversation appears without a manual refresh, UPDATE for reordering /
 *   unread badges, DELETE so a removed conversation drops off the list.
 * - Never trusts the raw realtime payload shape — every event just triggers
 *   a refetch through the existing REST API, which stays the single source
 *   of truth.
 * - On reconnect (channel status `SUBSCRIBED` after having dropped),
 *   invalidates everything conversation-related to repair any events missed
 *   while disconnected.
 * - Fallback: if a channel reports `CHANNEL_ERROR`/`CLOSED`/`TIMED_OUT`,
 *   degrades to polling every 5s until the channel reports `SUBSCRIBED`
 *   again.
 * - Safety net: independent of channel health, a low-frequency (30s)
 *   background poll always runs and invalidates everything. This covers
 *   the case where Realtime claims `SUBSCRIBED` but silently isn't
 *   delivering events — the two timers don't fight, since the 5s degraded
 *   poll only ever runs while a channel is actually down.
 * - Also invalidates everything whenever the tab regains visibility
 *   (`document.visibilitychange`), repairing anything missed while the tab
 *   was backgrounded/asleep and the browser throttled or dropped the
 *   websocket.
 *
 * NOTE: this depends on Realtime being enabled for "Message"/"Conversation"
 * in the target Supabase project and RLS allowing the caller to read the
 * rows it is subscribed to. Neither can be exercised in this sandbox — see
 * docs/plan/PHASE5_MANUAL_STEPS.md for the manual verification checklist.
 */
export function useRealtimeMessages(conversationId?: string): void {
  const queryClient = useQueryClient();
  const hadDropRef = useRef(false);

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

    // Always-on safety net (see doc comment above) — independent of
    // `pollTimer`/`startPolling`, which only ever run while a channel is
    // reporting a dropped connection.
    const safetyPollTimer = setInterval(invalidateAll, SAFETY_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") invalidateAll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channels: RealtimeChannel[] = [];

    const conversationChannel = supabase
      .channel("conversations-list-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Conversation" },
        invalidateList
      )
      .subscribe((status) => {
        handleStatus(status);
      });
    channels.push(conversationChannel);

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
          invalidateMessages
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "Message",
            filter: `conversationId=eq.${conversationId}`,
          },
          invalidateMessages
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
      clearInterval(safetyPollTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [conversationId, queryClient]);
}
