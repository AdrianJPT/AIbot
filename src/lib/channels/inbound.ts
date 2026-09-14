import { prisma } from "@/lib/db";
import type { ChannelAdapter, ChannelConnection } from "./contracts";
import { AdapterNotFoundError, resolveAdapter } from "./registry";
import "./whatsapp";

/** The persisted fields consumed by the inbound routing boundary. */
export type PersistedInboundEvent = {
  id: string;
  rawPayload: string | null;
  payload: unknown;
  channel: string | null;
  provider: string | null;
};

/** A decoded, tenant-bounded event ready for later drain normalization. */
export type ResolvedInboundEvent = {
  payload: Record<string, unknown>;
  raw: string;
  connection: ChannelConnection;
  adapter: ChannelAdapter;
};

/**
 * Decodes a durably persisted inbound row and resolves its exact tenant-owned
 * WhatsApp connection. This boundary deliberately does not normalize or
 * dispatch the event: drain/message-handler wiring remains Unit 5c.
 */
export async function resolveInboundEvent(
  event: PersistedInboundEvent,
): Promise<ResolvedInboundEvent | null> {
  const decoded = decodePayload(event);
  if (!decoded || !hasWhatsAppMetaDiscriminator(event)) return null;

  const phoneNumberId = phoneNumberIdFrom(decoded.payload);
  if (!phoneNumberId) return null;

  const connection = await resolveConnection(phoneNumberId);
  if (!connection) return null;

  try {
    return {
      ...decoded,
      connection,
      adapter: resolveAdapter("whatsapp", "meta", connection),
    };
  } catch (error) {
    if (error instanceof AdapterNotFoundError) return null;
    throw error;
  }
}

function decodePayload(
  event: PersistedInboundEvent,
): Pick<ResolvedInboundEvent, "payload" | "raw"> | null {
  if (event.rawPayload !== null) {
    try {
      const payload: unknown = JSON.parse(event.rawPayload);
      return isRecord(payload) ? { payload, raw: event.rawPayload } : null;
    } catch {
      return null;
    }
  }

  if (!isRecord(event.payload)) return null;
  return { payload: event.payload, raw: JSON.stringify(event.payload) };
}

function hasWhatsAppMetaDiscriminator(event: PersistedInboundEvent): boolean {
  if (event.channel === null && event.provider === null) return true;
  return event.channel === "whatsapp" && event.provider === "meta";
}

function phoneNumberIdFrom(payload: Record<string, unknown>): string | null {
  const entry = firstRecord(payload.entry);
  const change = entry && firstRecord(entry.changes);
  const value = change && recordAt(change, "value");
  const metadata = value && recordAt(value, "metadata");
  return metadata && stringAt(metadata, "phone_number_id");
}

async function resolveConnection(
  externalId: string,
): Promise<ChannelConnection | null> {
  const direct = await prisma.channelConnection.findFirst({
    where: { provider: "meta", externalId },
    include: { business: true },
  });
  if (direct) {
    return validConnection(direct, externalId) ? toConnection(direct) : null;
  }

  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: {
      phoneNumberId: externalId,
      isActive: true,
      business: { isActive: true },
    },
    include: { business: true },
  });
  if (!phoneNumber) return null;

  if (!phoneNumber.channelConnectionId) {
    return {
      id: `legacy:${phoneNumber.id}`,
      businessId: phoneNumber.businessId,
      channel: "whatsapp",
      provider: "meta",
      externalId: phoneNumber.phoneNumberId,
      isActive: true,
    };
  }

  const linked = await prisma.channelConnection.findUnique({
    where: { id: phoneNumber.channelConnectionId },
    include: { business: true },
  });
  if (
    !linked ||
    linked.businessId !== phoneNumber.businessId ||
    !validConnection(linked, externalId)
  ) {
    return null;
  }

  return toConnection(linked);
}

function validConnection(
  connection: {
    businessId: string;
    channel: string;
    provider: string;
    externalId: string;
    isActive: boolean;
    business: { isActive: boolean };
  },
  externalId: string,
): boolean {
  return (
    connection.isActive &&
    connection.business.isActive &&
    connection.channel === "whatsapp" &&
    connection.provider === "meta" &&
    connection.externalId === externalId
  );
}

function toConnection(connection: {
  id: string;
  businessId: string;
  channel: string;
  provider: string;
  externalId: string;
  credentialId: string | null;
  isActive: boolean;
}): ChannelConnection {
  return {
    ...connection,
    channel: "whatsapp",
    provider: "meta",
  };
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : null;
}

function recordAt(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  return isRecord(value[key]) ? value[key] : null;
}

function stringAt(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key].length > 0
    ? value[key]
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
