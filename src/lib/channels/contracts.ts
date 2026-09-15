/**
 * Channel-neutral transport contracts for the tenant-safe adapter
 * foundation (see `openspec/changes/channel-adapter-foundation/design.md`,
 * "Interfaces / Contracts"). These types are the boundary between a raw
 * provider event and the domain layer: everything the domain sees is a
 * `NormalizedEvent`, everything a domain workflow sends out is an
 * `OutboundRequest`/`MediaRequest`. No transport secret ever crosses this
 * boundary — adapters receive a resolved `secret` argument per call, they
 * never hold or cache one.
 */

import type { SendFailure } from "./send-failure";

/** Every channel this platform knows how to route, not just ones with a live adapter. */
export type Channel = "whatsapp";

/** Concrete transport/provider behind a channel (e.g. WhatsApp via Meta). */
export type Provider = "meta";

/** States a delivered outbound message can reach, mirrored across every adapter. */
export type DeliveryState = "sent" | "delivered" | "read" | "failed";

/**
 * Normalized message body. Semantic media types preserve legacy WhatsApp
 * behavior while keeping transport-specific field names out of the domain.
 */
export type ChannelContent =
  | {
      kind: "text";
      text: string;
      mediaType?: "text" | "location" | "document";
      externalMediaId?: string;
      filename?: string;
      location?: { latitude: number; longitude: number; name?: string };
    }
  | {
      kind: "media";
      externalMediaId: string;
      mediaType: "image" | "audio";
      mimeType?: string;
      caption?: string;
    };

/**
 * Tenant-owned connection identity a normalized event or outbound request is
 * scoped to. Mirrors the `ChannelConnection` Prisma model introduced in PR2
 * of this change; kept as a plain structural type here so PR1 has zero
 * dependency on the schema migration that lands later.
 */
export interface ChannelConnection {
  id: string;
  businessId: string;
  channel: Channel;
  provider: Provider;
  externalId: string;
  credentialId?: string | null;
  isActive: boolean;
}

/** Identifies which tenant/connection/channel an envelope belongs to. */
export type EnvelopeContext = {
  channel: Channel;
  tenantId: string;
  connectionId: string;
};

/** Adds the specific event identity to an envelope's tenant/connection scope. */
export type EventContext = EnvelopeContext & { eventId: string };

/** A normalized inbound message ready for domain processing. */
export type InboundMessage = EventContext & {
  kind: "message";
  from: string;
  content: ChannelContent;
  /** Provider-reported sender display name (e.g. WhatsApp `contacts[].profile.name`), when present and matching. */
  senderDisplayName?: string;
  /** Identifier of a quoted/replied-to message (e.g. WhatsApp `message.context.id`), when present. */
  quotedMessageId?: string;
};

/** A normalized delivery-status update for a previously sent message. */
export type DeliveryStatus = EventContext & {
  kind: "status";
  externalMessageId: string;
  status: DeliveryState;
  /**
   * Channel-neutral, descriptive-only failure classification (see
   * `channels/send-failure.ts`'s `SendFailure`), present only when
   * `status` is `"failed"` and a provider error was available to classify.
   * MUST NOT encode retry, window, or other channel-specific policy.
   */
  failure?: SendFailure;
};

/** A supported event an adapter intentionally normalizes to "no domain action". */
export type IgnoredEvent = EventContext & {
  kind: "ignored";
  reason: string;
};

/** The full set of outcomes normalization can produce for one raw event. */
export type NormalizedEvent = InboundMessage | DeliveryStatus | IgnoredEvent;

/** A verified, not-yet-parsed provider event as persisted at the durability boundary. */
export type RawChannelEvent = {
  channel: Channel;
  provider: Provider;
  raw: string;
  eventId: string;
};

/** A domain-issued request to send a text message out through a channel. */
export type OutboundRequest = EnvelopeContext & {
  requestId: string;
  to: string;
  text: string;
};

/** A domain-issued request to fetch inbound media referenced by a normalized event. */
export type MediaRequest = EnvelopeContext & {
  externalMediaId: string;
};

/**
 * The contract every channel adapter implements. Adapters own transport
 * normalization, media retrieval, and sending only — no deduplication,
 * persistence, payments, summaries, trust boundaries, or scheduling, all of
 * which stay in the domain layer per design's Architecture Decisions.
 *
 * `secret` is passed per call, resolved by the caller through
 * `src/lib/channels/credentials.ts` (PR7) — an adapter never stores or caches
 * a credential.
 */
export interface ChannelAdapter {
  normalize(
    raw: RawChannelEvent,
    connection: ChannelConnection,
  ): Promise<NormalizedEvent[]>;
  fetchMedia(
    request: MediaRequest,
    secret: string,
  ): Promise<{ buffer: Buffer; mimeType: string }>;
  send(
    request: OutboundRequest,
    secret: string,
  ): Promise<{ externalMessageId?: string }>;
}
