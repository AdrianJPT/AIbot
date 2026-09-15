import { Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEDIA_ICON } from "@/features/conversations/lib/format";
import {
  canRetryFailedMessage,
  sendFailureCopy,
} from "@/features/conversations/lib/send-failure-copy";
import { PaymentCardContainer } from "@/features/payments/containers/payment-card-container";
import type { ConversationMessage } from "@/features/conversations/types";

export type RenderableMessage = ConversationMessage & {
  pending?: boolean;
  failed?: boolean;
};

/**
 * WhatsApp-style delivery ticks for outbound (bot/human) bubbles, driven by
 * `Message.status`. Customer-originated messages never show ticks — WhatsApp
 * only reports delivery/read receipts for messages the business sends out.
 * `status === "failed"` is handled by the retry row below instead of here —
 * a failed message always renders cause-specific copy there, so this
 * component never runs with that status.
 */
function DeliveryTicks({ status }: { status: string }) {
  if (status === "pending") {
    // Message.status starts "pending" (message-handler.ts's
    // sendAndPersistReply) until the WhatsApp send resolves — distinct from
    // the optimistic-UI `message.pending` flag above, which this component
    // already renders a Clock icon for.
    return (
      <span title="Enviando" aria-label="Enviando">
        <Clock className="h-3 w-3 text-muted-foreground" />
      </span>
    );
  }
  if (status === "read") {
    return (
      <span title="Leído" aria-label="Leído">
        <CheckCheck className="h-3 w-3 text-sky-500" />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span title="Entregado" aria-label="Entregado">
        <CheckCheck className="h-3 w-3 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span title="Enviado" aria-label="Enviado">
      <Check className="h-3 w-3 text-muted-foreground" />
    </span>
  );
}

export function MessageBubble({
  message,
  onRetry,
  retrying,
}: {
  message: RenderableMessage;
  onRetry?: () => void;
  /**
   * Whether THIS message's retry request is currently in flight. Owned by
   * the container (the mutation's `isPending` state) and passed down as a
   * plain prop — the button stays purely presentational and needs no
   * internal state to disable itself immediately on click and re-enable
   * once the request settles.
   */
  retrying?: boolean;
}) {
  const isCustomer = message.sentBy === "customer";
  const isHuman = message.sentBy === "human";
  // Covers both a server-persisted failure (reload-safe, carries a real
  // failureCode) and the legacy client-only optimistic failure flag — the
  // container also sets status:"failed" on the latter, but this keeps
  // rendering correct even if a caller only ever sets `failed`.
  const isFailed = message.status === "failed" || Boolean(message.failed);
  const retryEligible = isFailed && canRetryFailedMessage(message);
  const failureCopy = isFailed ? sendFailureCopy(message.failureCode) : null;
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
          isFailed && "border border-destructive/50",
        )}
      >
        {isHuman && (
          <div className="mb-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            👤 Tú
          </div>
        )}

        <div className="whitespace-pre-wrap break-words">
          {message.mediaType !== "text" && (
            <span className="mr-1">
              {MEDIA_ICON[message.mediaType] ?? "📎"}
            </span>
          )}
          {message.content}
        </div>

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {message.pending && (
            <Clock className="h-3 w-3" aria-label="Enviando" />
          )}
          {isFailed && failureCopy ? (
            <button
              type="button"
              onClick={retryEligible ? onRetry : undefined}
              disabled={!retryEligible || retrying}
              title={failureCopy.title}
              aria-label={failureCopy.title}
              className={cn(
                "flex items-center gap-1",
                retryEligible
                  ? "text-destructive hover:underline"
                  : "cursor-not-allowed text-muted-foreground",
              )}
            >
              <RotateCcw className="h-3 w-3" />
              {retrying ? "Reintentando…" : failureCopy.retryLabel}
            </button>
          ) : (
            !message.pending && (
              <>
                <span>{time}</span>
                {!isCustomer && <DeliveryTicks status={message.status} />}
              </>
            )
          )}
        </div>

        {message.paymentSessionId && (
          <div className="mt-2">
            <PaymentCardContainer sessionId={message.paymentSessionId} />
          </div>
        )}
      </div>
    </div>
  );
}
