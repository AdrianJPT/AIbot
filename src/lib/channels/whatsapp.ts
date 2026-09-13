import type {
  ChannelAdapter,
  ChannelConnection,
  DeliveryState,
  IgnoredEvent,
  NormalizedEvent,
  RawChannelEvent,
} from "./contracts";
import { registerAdapter } from "./registry";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function context(connection: ChannelConnection, eventId: string) {
  return {
    channel: "whatsapp" as const,
    tenantId: connection.businessId,
    connectionId: connection.id,
    eventId,
  };
}

function ignored(
  connection: ChannelConnection,
  eventId: string,
  reason: string,
): IgnoredEvent {
  return { kind: "ignored", ...context(connection, eventId), reason };
}

function isDeliveryState(value: unknown): value is DeliveryState {
  return (
    value === "sent" ||
    value === "delivered" ||
    value === "read" ||
    value === "failed"
  );
}

function mediaId(message: RecordValue): string | undefined {
  if (
    message.type !== "image" &&
    message.type !== "audio" &&
    message.type !== "voice"
  ) {
    return undefined;
  }

  const media = message[message.type];
  return isRecord(media) && typeof media.id === "string" && media.id.length > 0
    ? media.id
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function interactiveTitle(message: RecordValue): string {
  const interactive = isRecord(message.interactive) ? message.interactive : {};
  const listTitle = isRecord(interactive.list_reply)
    ? optionalString(interactive.list_reply.title)
    : undefined;
  const buttonTitle = isRecord(interactive.button_reply)
    ? optionalString(interactive.button_reply.title)
    : undefined;

  return listTitle ?? buttonTitle ?? "[Interactivo sin texto]";
}

function values(raw: string): RecordValue[] {
  const payload: unknown = JSON.parse(raw);
  if (!isRecord(payload) || !Array.isArray(payload.entry)) {
    return [];
  }

  return payload.entry.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) {
      return [];
    }

    return entry.changes.flatMap((change) =>
      isRecord(change) && isRecord(change.value) ? [change.value] : [],
    );
  });
}

function normalizeMessage(
  message: unknown,
  connection: ChannelConnection,
): NormalizedEvent {
  if (!isRecord(message) || typeof message.id !== "string") {
    return ignored(connection, "unknown", "unsupported_message");
  }

  if (typeof message.from !== "string" || message.from.length === 0) {
    return ignored(connection, message.id, "missing_sender");
  }

  if (
    (message.type === "image" ||
      message.type === "audio" ||
      message.type === "voice") &&
    !mediaId(message)
  ) {
    return ignored(connection, message.id, "missing_media_id");
  }

  if (
    message.type === "text" &&
    isRecord(message.text) &&
    typeof message.text.body === "string"
  ) {
    return {
      kind: "message",
      ...context(connection, message.id),
      from: message.from,
      content: { kind: "text", text: message.text.body },
    };
  }

  if (message.type === "interactive") {
    return {
      kind: "message",
      ...context(connection, message.id),
      from: message.from,
      content: { kind: "text", text: interactiveTitle(message) },
    };
  }

  if (message.type === "location") {
    const location = message.location;
    if (
      !isRecord(location) ||
      typeof location.latitude !== "number" ||
      !Number.isFinite(location.latitude) ||
      typeof location.longitude !== "number" ||
      !Number.isFinite(location.longitude)
    ) {
      return ignored(connection, message.id, "invalid_location");
    }

    const name = optionalString(location.name);
    const locationContent = {
      latitude: location.latitude,
      longitude: location.longitude,
      ...(name ? { name } : {}),
    };
    return {
      kind: "message",
      ...context(connection, message.id),
      from: message.from,
      content: {
        kind: "text",
        text: `El cliente envió su ubicación: ${location.latitude}, ${location.longitude}${name ? ` (${name})` : ""}`,
        mediaType: "location",
        location: locationContent,
      },
    };
  }

  if (
    message.type === "image" ||
    message.type === "audio" ||
    message.type === "voice"
  ) {
    const media = message[message.type];
    const id = mediaId(message);
    if (!isRecord(media) || !id) {
      return ignored(connection, message.id, "missing_media_id");
    }

    const mimeType = optionalString(media.mime_type);
    const caption = optionalString(media.caption);
    return {
      kind: "message",
      ...context(connection, message.id),
      from: message.from,
      content: {
        kind: "media",
        externalMediaId: id,
        mediaType: message.type === "image" ? "image" : "audio",
        ...(mimeType ? { mimeType } : {}),
        ...(caption ? { caption } : {}),
      },
    };
  }

  if (message.type === "document") {
    const document = isRecord(message.document) ? message.document : {};
    const externalMediaId = optionalString(document.id);
    const filename = optionalString(document.filename);
    return {
      kind: "message",
      ...context(connection, message.id),
      from: message.from,
      content: {
        kind: "text",
        text: "[Documento adjunto]",
        mediaType: "document",
        ...(externalMediaId ? { externalMediaId } : {}),
        ...(filename ? { filename } : {}),
      },
    };
  }

  return ignored(connection, message.id, "unsupported_message");
}

function normalizeStatus(
  status: unknown,
  connection: ChannelConnection,
): NormalizedEvent {
  if (
    !isRecord(status) ||
    typeof status.id !== "string" ||
    !isDeliveryState(status.status)
  ) {
    return ignored(connection, "unknown", "unsupported_status");
  }

  return {
    kind: "status",
    ...context(connection, status.id),
    externalMessageId: status.id,
    status: status.status,
  };
}

export const whatsappAdapter: ChannelAdapter = {
  async normalize(raw: RawChannelEvent, connection: ChannelConnection) {
    const outcomes = values(raw.raw).flatMap((value) => {
      const messages = Array.isArray(value.messages)
        ? value.messages.map((message) => normalizeMessage(message, connection))
        : [];
      const statuses = Array.isArray(value.statuses)
        ? value.statuses.map((status) => normalizeStatus(status, connection))
        : [];

      return messages.length > 0 || statuses.length > 0
        ? [...messages, ...statuses]
        : [ignored(connection, raw.eventId, "unsupported_event")];
    });

    return outcomes.length > 0
      ? outcomes
      : [ignored(connection, raw.eventId, "unsupported_event")];
  },

  async fetchMedia() {
    throw new Error("WhatsApp media fetching is deferred to Unit 6");
  },

  async send() {
    throw new Error("WhatsApp sending is deferred to Unit 8");
  },
};

registerAdapter("whatsapp", "meta", whatsappAdapter);
