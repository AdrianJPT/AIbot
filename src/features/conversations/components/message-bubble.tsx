import { Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEDIA_ICON } from "@/features/conversations/lib/format";
import type { ConversationMessage } from "@/features/conversations/types";

export type RenderableMessage = ConversationMessage & {
  pending?: boolean;
  failed?: boolean;
};

export function MessageBubble({
  message,
  onRetry,
}: {
  message: RenderableMessage;
  onRetry?: () => void;
}) {
  const isCustomer = message.sentBy === "customer";
  const isHuman = message.sentBy === "human";
  const time = new Date(message.createdAt).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isCustomer
            ? "rounded-bl-sm bg-muted text-foreground"
            : "rounded-br-sm bg-emerald-600/15 text-foreground dark:bg-emerald-500/20",
          message.failed && "border border-destructive/50"
        )}
      >
        {isHuman && (
          <div className="mb-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            👤 Tú
          </div>
        )}

        <div className="whitespace-pre-wrap break-words">
          {message.mediaType !== "text" && (
            <span className="mr-1">{MEDIA_ICON[message.mediaType] ?? "📎"}</span>
          )}
          {message.content}
        </div>

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {message.pending && <Clock className="h-3 w-3" aria-label="Enviando" />}
          {message.failed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 text-destructive hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> Reintentar
            </button>
          ) : (
            !message.pending && <span>{time}</span>
          )}
        </div>
      </div>
    </div>
  );
}
