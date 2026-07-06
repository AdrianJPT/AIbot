"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Archive, ArchiveRestore, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppointmentsPanel } from "@/features/conversations/components/appointments-panel";
import { HandoffToggle } from "@/features/conversations/components/handoff-toggle";
import {
  MessageBubble,
  type RenderableMessage,
} from "@/features/conversations/components/message-bubble";
import { MessageComposer } from "@/features/conversations/components/message-composer";
import {
  dateSeparatorLabel,
  isOutsideWhatsAppWindow,
} from "@/features/conversations/lib/format";
import type { ConversationDetail } from "@/features/conversations/types";

const SCROLL_BOTTOM_THRESHOLD_PX = 80;

export function ConversationThread({
  conversation,
  messages,
  onLoadOlder,
  hasMoreOlder,
  loadingOlder,
  onSend,
  onRetry,
  sending,
  onHandoffChange,
  handoffLoading,
  lastCustomerMessageAt,
  onNicknameChange,
  onDelete,
  deleting,
}: {
  conversation: ConversationDetail;
  messages: RenderableMessage[];
  onLoadOlder: () => void;
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  sending: boolean;
  onHandoffChange: (next: string) => void;
  handoffLoading: boolean;
  lastCustomerMessageAt: string | null;
  onNicknameChange: (nickname: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showNewPill, setShowNewPill] = useState(false);
  const prevCount = useRef(messages.length);

  useEffect(() => {
    const grew = messages.length > prevCount.current;
    prevCount.current = messages.length;
    if (!grew) return;

    if (isNearBottom) {
      scrollToBottom();
    } else {
      setShowNewPill(true);
    }
  }, [messages.length, isNearBottom]);

  useEffect(() => {
    // Jump to bottom once when the thread first mounts / conversation changes.
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowNewPill(false);
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX);
    if (distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX) setShowNewPill(false);
    if (el.scrollTop < 60 && hasMoreOlder && !loadingOlder) {
      onLoadOlder();
    }
  }

  const name =
    conversation.nickname || conversation.customerName || conversation.customerPhone;
  const outsideWindow = isOutsideWhatsAppWindow(lastCustomerMessageAt);
  const isClosed = conversation.status === "closed";

  function startEditingName() {
    setNameDraft(conversation.nickname || "");
    setEditingName(true);
  }

  function commitName() {
    setEditingName(false);
    if (nameDraft.trim() !== (conversation.nickname || "")) {
      onNicknameChange(nameDraft.trim());
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border p-3">
        <Link
          href="/conversations"
          className="text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Volver a conversaciones"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <Input
              autoFocus
              value={nameDraft}
              placeholder={conversation.customerName || conversation.customerPhone}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="h-7 max-w-xs"
            />
          ) : (
            <button
              type="button"
              onClick={startEditingName}
              className="truncate text-left font-semibold hover:underline"
              title="Click para ponerle un apodo"
            >
              {name}
            </button>
          )}
          <div className="truncate text-xs text-muted-foreground">
            {conversation.customerPhone} · {conversation.business.name}
          </div>
        </div>
        <AppointmentsPanel conversationId={conversation.id} />
        <a
          href={`/api/conversations/${conversation.id}/export`}
          download
          className="text-muted-foreground hover:text-foreground"
          title="Descargar conversación (.txt)"
          aria-label="Descargar conversación (.txt)"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={() => onHandoffChange(isClosed ? "active" : "closed")}
          className="text-muted-foreground hover:text-foreground"
          title={isClosed ? "Reabrir conversación" : "Archivar conversación"}
          aria-label={isClosed ? "Reabrir conversación" : "Archivar conversación"}
        >
          {isClosed ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (confirm("¿Eliminar esta conversación? Se borra todo su historial.")) {
              onDelete();
            }
          }}
          className="text-muted-foreground hover:text-destructive"
          title="Eliminar conversación"
          aria-label="Eliminar conversación"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <HandoffToggle
          status={conversation.status}
          onChange={onHandoffChange}
          loading={handoffLoading}
        />
      </div>

      {outsideWindow && (
        <div className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Fuera de la ventana de 24h de WhatsApp — el mensaje puede ser rechazado.
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full space-y-2 overflow-y-auto p-4"
        >
          {loadingOlder && (
            <p className="text-center text-xs text-muted-foreground">Cargando…</p>
          )}
          {renderWithSeparators(messages, onRetry)}
        </div>

        {showNewPill && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
          >
            <ArrowDown className="h-3 w-3" /> Nuevos mensajes
          </button>
        )}
      </div>

      <MessageComposer onSend={onSend} disabled={sending} />
    </div>
  );
}

function renderWithSeparators(
  messages: RenderableMessage[],
  onRetry: (id: string) => void
) {
  const nodes: React.ReactNode[] = [];
  let lastDay: string | null = null;

  for (const message of messages) {
    const label = dateSeparatorLabel(message.createdAt);
    if (label !== lastDay) {
      nodes.push(
        <div key={`sep-${message.id}`} className="flex justify-center py-2">
          <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
            {label}
          </span>
        </div>
      );
      lastDay = label;
    }
    nodes.push(
      <MessageBubble
        key={message.id}
        message={message}
        onRetry={message.failed ? () => onRetry(message.id) : undefined}
      />
    );
  }

  return nodes;
}
