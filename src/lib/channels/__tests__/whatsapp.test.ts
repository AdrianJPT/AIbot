import { describe, expect, it, vi } from "vitest";
import type { ChannelConnection, RawChannelEvent } from "../contracts";
import { AdapterNotFoundError, resolveAdapter } from "../registry";
import { whatsappAdapter } from "../whatsapp";

function connection(): ChannelConnection {
  return {
    id: "connection_1",
    businessId: "business_1",
    channel: "whatsapp",
    provider: "meta",
    externalId: "phone_1",
    isActive: true,
  };
}

function event(value: unknown): RawChannelEvent {
  return {
    channel: "whatsapp",
    provider: "meta",
    eventId: "webhook_1",
    raw: JSON.stringify({
      entry: [{ changes: [{ value }] }],
    }),
  };
}

describe("channels/whatsapp base adapter", () => {
  it("normalizes a WhatsApp text message", async () => {
    const outcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.text_1",
            from: "51999111222",
            type: "text",
            text: { body: "Hello from WhatsApp" },
          },
        ],
      }),
      connection(),
    );

    expect(outcomes).toEqual([
      {
        kind: "message",
        channel: "whatsapp",
        tenantId: "business_1",
        connectionId: "connection_1",
        eventId: "wamid.text_1",
        from: "51999111222",
        content: { kind: "text", text: "Hello from WhatsApp" },
      },
    ]);
  });

  it("normalizes a supported delivery status", async () => {
    const outcomes = await whatsappAdapter.normalize(
      event({
        statuses: [
          {
            id: "wamid.status_1",
            status: "delivered",
          },
        ],
      }),
      connection(),
    );

    expect(outcomes).toEqual([
      {
        kind: "status",
        channel: "whatsapp",
        tenantId: "business_1",
        connectionId: "connection_1",
        eventId: "wamid.status_1",
        externalMessageId: "wamid.status_1",
        status: "delivered",
      },
    ]);
  });

  it("ignores unsupported messages and non-message changes", async () => {
    const outcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.reaction_1",
            from: "51999111222",
            type: "reaction",
          },
        ],
      }),
      connection(),
    );

    const nonMessageOutcomes = await whatsappAdapter.normalize(
      event({ contacts: [{ wa_id: "51999111222" }] }),
      connection(),
    );

    expect(outcomes).toMatchObject([
      {
        kind: "ignored",
        eventId: "wamid.reaction_1",
        reason: "unsupported_message",
      },
    ]);
    expect(nonMessageOutcomes).toMatchObject([
      { kind: "ignored", eventId: "webhook_1", reason: "unsupported_event" },
    ]);
  });

  it("ignores messages without a sender", async () => {
    const outcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          { id: "wamid.no_sender", type: "text", text: { body: "Hello" } },
        ],
      }),
      connection(),
    );

    expect(outcomes).toMatchObject([
      { kind: "ignored", eventId: "wamid.no_sender", reason: "missing_sender" },
    ]);
  });

  it.each(["image", "audio"])(
    "ignores %s messages without a media id",
    async (type) => {
      const outcomes = await whatsappAdapter.normalize(
        event({
          messages: [
            {
              id: `wamid.${type}_without_id`,
              from: "51999111222",
              type,
              [type]: {},
            },
          ],
        }),
        connection(),
      );

      expect(outcomes).toMatchObject([
        {
          kind: "ignored",
          eventId: `wamid.${type}_without_id`,
          reason: "missing_media_id",
        },
      ]);
    },
  );

  it("normalizes interactive button and list titles with the exact fallback", async () => {
    const buttonOutcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.button_1",
            from: "51999111222",
            type: "interactive",
            interactive: { button_reply: { title: "Confirm appointment" } },
          },
          {
            id: "wamid.list_1",
            from: "51999111222",
            type: "interactive",
            interactive: { list_reply: { title: "Choose a service" } },
          },
          {
            id: "wamid.interactive_empty",
            from: "51999111222",
            type: "interactive",
            interactive: { button_reply: {} },
          },
        ],
      }),
      connection(),
    );

    expect(buttonOutcomes).toMatchObject([
      {
        kind: "message",
        eventId: "wamid.button_1",
        content: { kind: "text", text: "Confirm appointment" },
      },
      {
        kind: "message",
        eventId: "wamid.list_1",
        content: { kind: "text", text: "Choose a service" },
      },
      {
        kind: "message",
        eventId: "wamid.interactive_empty",
        content: { kind: "text", text: "[Interactivo sin texto]" },
      },
    ]);
  });

  it("normalizes a valid location and ignores invalid locations without a message outcome", async () => {
    const validOutcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.location_1",
            from: "51999111222",
            type: "location",
            location: {
              latitude: 19.432608,
              longitude: -99.133209,
              name: "Zócalo",
            },
          },
        ],
      }),
      connection(),
    );
    const invalidOutcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.location_invalid",
            from: "51999111222",
            type: "location",
            location: { latitude: "not-a-number", longitude: -99.133209 },
          },
        ],
      }),
      connection(),
    );

    expect(validOutcomes).toMatchObject([
      {
        kind: "message",
        eventId: "wamid.location_1",
        content: {
          kind: "text",
          text: "El cliente envió su ubicación: 19.432608, -99.133209 (Zócalo)",
          mediaType: "location",
          location: {
            latitude: 19.432608,
            longitude: -99.133209,
            name: "Zócalo",
          },
        },
      },
    ]);
    expect(invalidOutcomes).toEqual([
      expect.objectContaining({
        kind: "ignored",
        eventId: "wamid.location_invalid",
        reason: "invalid_location",
      }),
    ]);
    expect(invalidOutcomes).not.toContainEqual(
      expect.objectContaining({ kind: "message" }),
    );
  });

  it("normalizes image, audio, and voice media only when they have an id", async () => {
    const outcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.image_1",
            from: "51999111222",
            type: "image",
            image: {
              id: "image_media_1",
              mime_type: "image/jpeg",
              caption: "Receipt",
            },
          },
          {
            id: "wamid.audio_1",
            from: "51999111222",
            type: "audio",
            audio: { id: "audio_media_1", mime_type: "audio/ogg" },
          },
          {
            id: "wamid.voice_1",
            from: "51999111222",
            type: "voice",
            voice: { id: "voice_media_1", mime_type: "audio/ogg" },
          },
          {
            id: "wamid.voice_without_id",
            from: "51999111222",
            type: "voice",
            voice: {},
          },
        ],
      }),
      connection(),
    );

    expect(outcomes).toMatchObject([
      {
        kind: "message",
        eventId: "wamid.image_1",
        content: {
          kind: "media",
          externalMediaId: "image_media_1",
          mediaType: "image",
          mimeType: "image/jpeg",
          caption: "Receipt",
        },
      },
      {
        kind: "message",
        eventId: "wamid.audio_1",
        content: {
          kind: "media",
          externalMediaId: "audio_media_1",
          mediaType: "audio",
          mimeType: "audio/ogg",
        },
      },
      {
        kind: "message",
        eventId: "wamid.voice_1",
        content: {
          kind: "media",
          externalMediaId: "voice_media_1",
          mediaType: "audio",
          mimeType: "audio/ogg",
        },
      },
      {
        kind: "ignored",
        eventId: "wamid.voice_without_id",
        reason: "missing_media_id",
      },
    ]);
    expect(outcomes).not.toContainEqual(
      expect.objectContaining({
        kind: "message",
        eventId: "wamid.voice_without_id",
      }),
    );
  });

  it("normalizes documents with the legacy placeholder and optional media metadata", async () => {
    const outcomes = await whatsappAdapter.normalize(
      event({
        messages: [
          {
            id: "wamid.document_1",
            from: "51999111222",
            type: "document",
            document: { id: "document_media_1", filename: "estimate.pdf" },
          },
          {
            id: "wamid.document_without_id",
            from: "51999111222",
            type: "document",
            document: { filename: "draft.pdf" },
          },
        ],
      }),
      connection(),
    );

    expect(outcomes).toMatchObject([
      {
        kind: "message",
        eventId: "wamid.document_1",
        content: {
          kind: "text",
          text: "[Documento adjunto]",
          mediaType: "document",
          externalMediaId: "document_media_1",
          filename: "estimate.pdf",
        },
      },
      {
        kind: "message",
        eventId: "wamid.document_without_id",
        content: {
          kind: "text",
          text: "[Documento adjunto]",
          mediaType: "document",
          filename: "draft.pdf",
        },
      },
    ]);
  });

  it("self-registers exactly the WhatsApp/Meta adapter", () => {
    expect(resolveAdapter("whatsapp", "meta", connection())).toBe(
      whatsappAdapter,
    );
  });

  it("fails closed for an unknown registry selection without adapter calls", () => {
    const normalize = vi.spyOn(whatsappAdapter, "normalize");
    const unknownConnection = {
      ...connection(),
      channel: "telegram" as unknown as ChannelConnection["channel"],
      provider: "telegram-bot-api" as unknown as ChannelConnection["provider"],
    };

    expect(() =>
      resolveAdapter(
        "telegram" as unknown as Parameters<typeof resolveAdapter>[0],
        "telegram-bot-api" as unknown as Parameters<typeof resolveAdapter>[1],
        unknownConnection,
      ),
    ).toThrow(AdapterNotFoundError);
    expect(normalize).not.toHaveBeenCalled();
  });
});
