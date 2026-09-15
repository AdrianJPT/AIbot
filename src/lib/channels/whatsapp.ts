import type {
  ChannelAdapter,
  ChannelConnection,
  ChannelContent,
  DeliveryState,
  DeliveryStatus,
  IgnoredEvent,
  InboundMessage,
  NormalizedEvent,
  RawChannelEvent,
} from "./contracts";
import { registerAdapter } from "./registry";
import { classifyMetaError } from "./whatsapp-send-failure";

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

/** Maps `contacts[].profile.name` to a display name, only for the contact matching `from`. */
function senderDisplayName(
  contacts: unknown,
  from: string,
): string | undefined {
  if (!Array.isArray(contacts)) {
    return undefined;
  }

  const match = contacts.find(
    (contact) => isRecord(contact) && contact.wa_id === from,
  );
  return isRecord(match) && isRecord(match.profile)
    ? optionalString(match.profile.name)
    : undefined;
}

/** Maps `message.context.id` to a quoted-message identifier. */
function quotedMessageId(message: RecordValue): string | undefined {
  return isRecord(message.context)
    ? optionalString(message.context.id)
    : undefined;
}

function buildMessage(
  connection: ChannelConnection,
  message: RecordValue,
  contacts: unknown,
  content: ChannelContent,
): InboundMessage {
  const displayName = senderDisplayName(contacts, message.from as string);
  const quotedId = quotedMessageId(message);
  return {
    kind: "message",
    ...context(connection, message.id as string),
    from: message.from as string,
    content,
    ...(displayName ? { senderDisplayName: displayName } : {}),
    ...(quotedId ? { quotedMessageId: quotedId } : {}),
  };
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
  contacts: unknown,
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
    return buildMessage(connection, message, contacts, {
      kind: "text",
      text: message.text.body,
    });
  }

  if (message.type === "interactive") {
    return buildMessage(connection, message, contacts, {
      kind: "text",
      text: interactiveTitle(message),
    });
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
    return buildMessage(connection, message, contacts, {
      kind: "text",
      text: `El cliente envió su ubicación: ${location.latitude}, ${location.longitude}${name ? ` (${name})` : ""}`,
      mediaType: "location",
      location: locationContent,
    });
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
    return buildMessage(connection, message, contacts, {
      kind: "media",
      externalMediaId: id,
      mediaType: message.type === "image" ? "image" : "audio",
      ...(mimeType ? { mimeType } : {}),
      ...(caption ? { caption } : {}),
    });
  }

  if (message.type === "document") {
    const document = isRecord(message.document) ? message.document : {};
    const externalMediaId = optionalString(document.id);
    const filename = optionalString(document.filename);
    return buildMessage(connection, message, contacts, {
      kind: "text",
      text: "[Documento adjunto]",
      mediaType: "document",
      ...(externalMediaId ? { externalMediaId } : {}),
      ...(filename ? { filename } : {}),
    });
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

  const base: DeliveryStatus = {
    kind: "status",
    ...context(connection, status.id),
    externalMessageId: status.id,
    status: status.status,
  };

  // Classification only applies to a failed delivery — a success or
  // unclassified status envelope carries no `failure` key at all (design's
  // "Async status" decision: "success/unclassified envelopes carry no
  // `failure` key").
  if (status.status !== "failed") {
    return base;
  }

  const errors = Array.isArray(status.errors) ? status.errors : [];
  return { ...base, failure: classifyMetaError(errors[0]) };
}

export const whatsappAdapter: ChannelAdapter = {
  async normalize(raw: RawChannelEvent, connection: ChannelConnection) {
    const outcomes = values(raw.raw).flatMap((value) => {
      const messages = Array.isArray(value.messages)
        ? value.messages.map((message) =>
            normalizeMessage(message, connection, value.contacts),
          )
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
