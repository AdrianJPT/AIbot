"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Download,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppointmentsPanel } from "@/features/conversations/components/appointments-panel";
import { HandoffToggle } from "@/features/conversations/components/handoff-toggle";
import { PaymentHandoffMarker } from "@/features/conversations/components/payment-handoff-marker";
import { SummaryPanel } from "@/features/conversations/components/summary-panel";
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
  onRegenerateSummary,
  regeneratingSummary,
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
  onRegenerateSummary: () => void;
  regeneratingSummary: boolean;
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
      // The pill appears because the thread grew while the user was scrolled
      // up, and stays until they dismiss it — that outlives the render that
      // caused it, so it cannot be derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowNewPill(true);
    }
  }, [messages.length, isNearBottom]);

  useEffect(() => {
    // Jump to bottom once when the thread first mounts / conversation changes.
    scrollToBottom("auto");
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
    conversation.nickname ||
    conversation.customerName ||
    conversation.customerPhone;
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
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2 sm:gap-2 sm:p-3">
        <Link
          href="/conversations"
          className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Volver a conversaciones"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] md:basis-0">
          {editingName ? (
            <Input
              autoFocus
              value={nameDraft}
              placeholder={
                conversation.customerName || conversation.customerPhone
              }
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
        <div className="flex w-full flex-wrap items-center gap-1 md:w-auto md:flex-nowrap">
          <SummaryPanel
            summary={conversation.summary}
            summarizedThroughAt={conversation.summarizedThroughAt}
            onRegenerate={onRegenerateSummary}
            loading={regeneratingSummary}
          />
          <AppointmentsPanel conversationId={conversation.id} />
          {conversation.hasEscalatedPayment && <PaymentHandoffMarker />}
          <a
            href={`/api/conversations/${conversation.id}/export`}
            download
            className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
            title="Descargar conversación (.txt)"
            aria-label="Descargar conversación (.txt)"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => onHandoffChange(isClosed ? "active" : "closed")}
            className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
            title={isClosed ? "Reabrir conversación" : "Archivar conversación"}
            aria-label={
              isClosed ? "Reabrir conversación" : "Archivar conversación"
            }
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
              if (
                confirm(
                  "¿Eliminar esta conversación? Se borra todo su historial.",
                )
              ) {
                onDelete();
              }
            }}
            className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-destructive"
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
      </div>

      {outsideWindow && (
        <div className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Fuera de la ventana de 24h de WhatsApp — el mensaje puede ser
          rechazado.
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Mensajes de la conversación"
          className="h-full space-y-2 overflow-y-auto p-3 sm:p-4"
        >
          {loadingOlder && (
            <p className="text-center text-xs text-muted-foreground">
              Cargando…
            </p>
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
  onRetry: (id: string) => void,
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
        </div>,
      );
      lastDay = label;
    }
    nodes.push(
      <MessageBubble
        key={message.id}
        message={message}
        onRetry={message.failed ? () => onRetry(message.id) : undefined}
      />,
    );
  }

  return nodes;
}
