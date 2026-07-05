"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConversationView } from "@/features/conversations/components/conversation-view";
import {
  sendManualMessage,
  setConversationStatus,
} from "@/features/conversations/api";
import type { ConversationDetail } from "@/features/conversations/types";

export function ConversationViewContainer({
  conversation,
}: {
  conversation: ConversationDetail;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(conversation.status);
  const [text, setText] = useState("");

  const handoffMutation = useMutation({
    mutationFn: (next: string) => setConversationStatus(conversation.id, next),
    onSuccess: (_data, next) => {
      setStatus(next);
      toast.success("Estado actualizado");
      router.refresh();
    },
    onError: () => toast.error("No se pudo actualizar el estado"),
  });

  const sendMutation = useMutation({
    mutationFn: (value: string) => sendManualMessage(conversation.id, value),
    onSuccess: () => {
      setText("");
      toast.success("Mensaje enviado");
      router.refresh();
    },
    onError: () => toast.error("No se pudo enviar"),
  });

  const loading = handoffMutation.isPending || sendMutation.isPending;

  return (
    <ConversationView
      status={status}
      messages={conversation.messages}
      text={text}
      onTextChange={setText}
      onHandoff={(next) => handoffMutation.mutate(next)}
      onSend={() => {
        const trimmed = text.trim();
        if (!trimmed) return;
        sendMutation.mutate(trimmed);
      }}
      loading={loading}
    />
  );
}
