import type { Channel } from "@/lib/channels/contracts";

/**
 * Customer-service window (CSW) — the provider-defined period during which a
 * channel allows free-form outbound replies, keyed by channel because each
 * provider defines its own duration (today only WhatsApp's 24h rule).
 *
 * NOT the reply debounce (`Business.replyWindowMs`) — that is an unrelated,
 * operator-configured batching delay. Do not share identifiers, field
 * names, or copy between the two.
 */
const CUSTOMER_SERVICE_WINDOW_MS: Record<Channel, number> = {
  whatsapp: 24 * 60 * 60 * 1000,
};

export type CustomerServiceWindowState = "within" | "outside" | "indeterminate";

/**
 * Computes the CSW state for a channel from the last inbound customer
 * message. Purely informational — callers must never use this to disable
 * the composer.
 */
export function customerServiceWindowState(
  channel: Channel,
  lastInboundAt: string | Date | null,
  now: Date = new Date(),
): CustomerServiceWindowState {
  if (!lastInboundAt) return "indeterminate";

  const lastInbound =
    typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
  const elapsedMs = now.getTime() - lastInbound.getTime();
  const windowMs = CUSTOMER_SERVICE_WINDOW_MS[channel];

  return elapsedMs >= windowMs ? "outside" : "within";
}
