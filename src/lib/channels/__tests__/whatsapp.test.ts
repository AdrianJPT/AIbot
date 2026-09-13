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
