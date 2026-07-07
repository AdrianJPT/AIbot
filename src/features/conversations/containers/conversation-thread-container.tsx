"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConversationThread } from "@/features/conversations/components/conversation-thread";
import type { RenderableMessage } from "@/features/conversations/components/message-bubble";
import {
  deleteConversation,
  fetchMessages,
  markConversationRead,
  sendManualMessage,
  setConversationNickname,
  setConversationStatus,
} from "@/features/conversations/api";
import { useRealtimeMessages } from "@/features/conversations/hooks/use-realtime-messages";
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
  const [pending, setPending] = useState<RenderableMessage[]>([]);

  useRealtimeMessages(initialConversation.id);

  useEffect(() => {
    // Reset local overrides when navigating between conversations.
    setStatus(initialConversation.status);
    setNickname(initialConversation.nickname);
    setPending([]);
  }, [initialConversation.id, initialConversation.status, initialConversation.nickname]);

  useEffect(() => {
    markConversationRead(initialConversation.id).catch(() => {
      // Best-effort — a failed read receipt is not worth surfacing to the
      // admin, the unread badge just won't clear until the next open.
    });
    queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversation.id]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
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
    mutationFn: (next: string) => setConversationStatus(initialConversation.id, next),
    onSuccess: (_data, next) => {
      setStatus(next);
      toast.success(
        next === "handed_off" ? "Bot pausado para este cliente" : "Estado actualizado"
      );
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: () => toast.error("No se pudo actualizar el estado"),
  });

  const nicknameMutation = useMutation({
    mutationFn: (next: string) => setConversationNickname(initialConversation.id, next),
    onSuccess: (_data, next) => {
      setNickname(next || null);
      toast.success("Apodo actualizado");
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: () => toast.error("No se pudo actualizar el apodo"),
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
      // Seed the confirmed message straight from the response instead of
      // invalidating — invalidation triggers a refetch (or waits for the
      // Realtime INSERT event) that can lag a few seconds behind the temp
      // bubble being removed, causing a visible disappear/reappear flicker.
      queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        conversationKeys.messages(initialConversation.id),
        (old) => {
          if (!old) return old;
          const [firstPage, ...rest] = old.pages;
          return {
            ...old,
            pages: [{ ...firstPage, messages: [msg, ...firstPage.messages] }, ...rest],
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: (_error, { tempId }) => {
      setPending((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
      toast.error("No se pudo enviar el mensaje");
    },
  });

  function handleSend(text: string) {
    sendMutation.mutate({ text, tempId: `temp-${crypto.randomUUID()}` });
  }

  function handleRetry(id: string) {
    const failedMessage = pending.find((m) => m.id === id);
    if (!failedMessage) return;
    sendMutation.mutate({ text: failedMessage.content, tempId: id });
  }

  return (
    <ConversationThread
      conversation={{ ...initialConversation, status, nickname }}
      messages={messages}
      onLoadOlder={() => fetchNextPage()}
      hasMoreOlder={Boolean(hasNextPage)}
      loadingOlder={isFetchingNextPage}
      onSend={handleSend}
      onRetry={handleRetry}
      sending={sendMutation.isPending}
      onHandoffChange={(next) => handoffMutation.mutate(next)}
      handoffLoading={handoffMutation.isPending}
      lastCustomerMessageAt={lastCustomerMessageAt}
      onNicknameChange={(next) => nicknameMutation.mutate(next)}
      onDelete={() => deleteMutation.mutate()}
      deleting={deleteMutation.isPending}
    />
  );
}
