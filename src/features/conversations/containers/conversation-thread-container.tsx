"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ConversationThread } from "@/features/conversations/components/conversation-thread";
import type { RenderableMessage } from "@/features/conversations/components/message-bubble";
import {
  clearConversationSummary,
  deleteConversation,
  fetchMessages,
  markConversationRead,
  retryFailedMessage,
  sendManualMessage,
  setConversationNickname,
  setConversationStatus,
} from "@/features/conversations/api";
import { useRealtimeMessages } from "@/features/conversations/hooks/use-realtime-messages";
import { markMessageRetried } from "@/features/conversations/lib/mark-message-retried";
import { conversationKeys } from "@/features/conversations/query-keys";
import type {
  ConversationDetail,
  MessagesPage,
} from "@/features/conversations/types";

export function ConversationThreadContainer({
  conversation: initialConversation,
  initialMessages,
}: {
  conversation: ConversationDetail;
  initialMessages: MessagesPage;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(initialConversation.status);
  const [nickname, setNickname] = useState(initialConversation.nickname);
  const [summary, setSummary] = useState(initialConversation.summary);
  const [summarizedThroughAt, setSummarizedThroughAt] = useState(
    initialConversation.summarizedThroughAt,
  );
  const [pending, setPending] = useState<RenderableMessage[]>([]);

  useRealtimeMessages(initialConversation.id);

  useEffect(() => {
    // Reset local overrides when navigating between conversations. The
    // idiomatic fix is a `key={conversation.id}` on this container so React
    // remounts it per conversation and drops the effect entirely; that is a
    // separate change because it touches the parent route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(initialConversation.status);
    setNickname(initialConversation.nickname);
    // The summary must reset with the rest, and this one is not cosmetic: it is
    // another customer's remembered name, preferences and notes. Leaving it stale
    // would show customer A's memory inside customer B's thread, which is the
    // exact opposite of what this panel is for.
    setSummary(initialConversation.summary);
    setSummarizedThroughAt(initialConversation.summarizedThroughAt);
    setPending([]);
  }, [
    initialConversation.id,
    initialConversation.status,
    initialConversation.nickname,
    initialConversation.summary,
    initialConversation.summarizedThroughAt,
  ]);

  useEffect(() => {
    markConversationRead(initialConversation.id).catch(() => {
      // Best-effort — a failed read receipt is not worth surfacing to the
      // admin, the unread badge just won't clear until the next open.
    });
    queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversation.id]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: conversationKeys.messages(initialConversation.id),
      queryFn: ({ pageParam }) =>
        fetchMessages(initialConversation.id, pageParam as string | null),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialData: { pages: [initialMessages], pageParams: [null] },
    });

  const messages = useMemo<RenderableMessage[]>(() => {
    const pages = data?.pages ?? [];
    const chronological = [...pages]
      .reverse()
      .flatMap((page) => [...page.messages].reverse());
    return [...chronological, ...pending];
  }, [data, pending]);

  const lastCustomerMessageAt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sentBy === "customer") return messages[i].createdAt;
    }
    return null;
  }, [messages]);

  const handoffMutation = useMutation({
    mutationFn: (next: string) =>
      setConversationStatus(initialConversation.id, next),
    onSuccess: (_data, next) => {
      setStatus(next);
      toast.success(
        next === "handed_off"
          ? "Bot pausado para este cliente"
          : "Estado actualizado",
      );
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: () => toast.error("No se pudo actualizar el estado"),
  });

  const nicknameMutation = useMutation({
    mutationFn: (next: string) =>
      setConversationNickname(initialConversation.id, next),
    onSuccess: (_data, next) => {
      setNickname(next || null);
      toast.success("Apodo actualizado");
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: () => toast.error("No se pudo actualizar el apodo"),
  });

  const summaryMutation = useMutation({
    mutationFn: () => clearConversationSummary(initialConversation.id),
    onSuccess: () => {
      // Cleared locally too: the thread renders from `initialConversation`, which
      // came from the server on navigation, so without this the panel would keep
      // showing the summary it just discarded.
      setSummary(null);
      setSummarizedThroughAt(null);
      toast.success("Resumen borrado, se regenera solo");
    },
    onError: () => toast.error("No se pudo borrar el resumen"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConversation(initialConversation.id),
    onSuccess: () => {
      toast.success("Conversación eliminada");
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      router.push("/conversations");
    },
    onError: () => toast.error("No se pudo eliminar la conversación"),
  });

  // Seeds a confirmed message straight from a send/retry response instead of
  // invalidating — invalidation triggers a refetch (or waits for the
  // Realtime INSERT event) that can lag a few seconds behind the temp
  // bubble being removed, causing a visible disappear/reappear flicker.
  function seedConfirmedMessage(msg: RenderableMessage) {
    queryClient.setQueryData<{
      pages: MessagesPage[];
      pageParams: unknown[];
    }>(conversationKeys.messages(initialConversation.id), (old) => {
      if (!old) return old;
      const [firstPage, ...rest] = old.pages;
      return {
        ...old,
        pages: [
          { ...firstPage, messages: [msg, ...firstPage.messages] },
          ...rest,
        ],
      };
    });
    queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
  }

  const sendMutation = useMutation({
    mutationFn: ({ text }: { text: string; tempId: string }) =>
      sendManualMessage(initialConversation.id, text),
    onMutate: ({ text, tempId }) => {
      setPending((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        {
          id: tempId,
          role: "assistant",
          content: text,
          mediaType: "text",
          sentBy: "human",
          status: "sent",
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]);
    },
    onSuccess: (msg, { tempId }) => {
      setPending((prev) => prev.filter((m) => m.id !== tempId));
      seedConfirmedMessage(msg);
    },
    onError: (_error, { tempId }) => {
      setPending((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, pending: false, failed: true, status: "failed" }
            : m,
        ),
      );
      toast.error("No se pudo enviar el mensaje");
    },
  });

  // Retries a failed OUTBOUND message by its persisted id — never re-sends
  // via the composer path, so the request body carries `retryOf` only
  // (never `sentBy` or `text`, design decision "Retry sender"). The server
  // re-validates eligibility (tenant scope, role/status/failureCode), so a
  // stale/ineligible id surfaces as a 404/409 toast rather than a silent
  // no-op.
  const retryMutation = useMutation({
    mutationFn: (messageId: string) =>
      retryFailedMessage(initialConversation.id, messageId),
    onSuccess: (msg, originalId) => {
      seedConfirmedMessage(msg);
      if (msg.status === "failed") {
        toast.error("No se pudo entregar el mensaje reintentado");
      } else {
        // Patches the ORIGINAL failed bubble's cache entry immediately, so
        // its "Reintentar" disables without waiting for a refetch — see
        // markMessageRetried (retry-duplicate-and-visible-cause defect 1).
        queryClient.setQueryData<{
          pages: MessagesPage[];
          pageParams: unknown[];
        }>(conversationKeys.messages(initialConversation.id), (old) =>
          old
            ? { ...old, pages: markMessageRetried(old.pages, originalId) }
            : old,
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "No se pudo reintentar el mensaje");
    },
  });

  function handleSend(text: string) {
    sendMutation.mutate({ text, tempId: `temp-${crypto.randomUUID()}` });
  }

  function handleRetry(id: string) {
    // A client-side optimistic bubble that failed before the request ever
    // reached the server (network error, 5xx) has no persisted row, so
    // `retryOf` would 404. Re-send it through the composer path with its
    // original text instead; only server-persisted failures use `retryOf`.
    const neverPersisted = pending.find((m) => m.id === id);
    if (neverPersisted) {
      sendMutation.mutate({ text: neverPersisted.content, tempId: id });
      return;
    }
    retryMutation.mutate(id);
  }

  // Which message id's retry is currently in flight, if any — passed down
  // so only that message's bubble disables its retry button
  // (`retryMutation.isPending` alone would disable every failed bubble at
  // once). A composer-path re-send re-enters the pending state, which the
  // bubble already renders as pending, so it needs no id here.
  const retryingId = retryMutation.isPending
    ? (retryMutation.variables ?? null)
    : null;

  return (
    <ConversationThread
      conversation={{
        ...initialConversation,
        status,
        nickname,
        summary,
        summarizedThroughAt,
      }}
      messages={messages}
      onLoadOlder={() => fetchNextPage()}
      hasMoreOlder={Boolean(hasNextPage)}
      loadingOlder={isFetchingNextPage}
      onSend={handleSend}
      onRetry={handleRetry}
      retryingId={retryingId}
      sending={sendMutation.isPending}
      onHandoffChange={(next) => handoffMutation.mutate(next)}
      handoffLoading={handoffMutation.isPending}
      lastCustomerMessageAt={lastCustomerMessageAt}
      onNicknameChange={(next) => nicknameMutation.mutate(next)}
      onDelete={() => deleteMutation.mutate()}
      deleting={deleteMutation.isPending}
      onRegenerateSummary={() => summaryMutation.mutate()}
      regeneratingSummary={summaryMutation.isPending}
    />
  );
}
