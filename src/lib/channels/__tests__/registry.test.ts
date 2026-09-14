import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelAdapter, ChannelConnection } from "../contracts";
import { AdapterNotFoundError, registerAdapter, resolveAdapter } from "../registry";

function makeFakeAdapter(): ChannelAdapter {
  return {
    normalize: vi.fn(),
    fetchMedia: vi.fn(),
    send: vi.fn(),
  };
}

function makeConnection(
  overrides: Partial<ChannelConnection> = {},
): ChannelConnection {
  return {
    id: "conn_1",
    businessId: "biz_1",
    channel: "whatsapp",
    provider: "meta",
    externalId: "1234567890",
    credentialId: null,
    isActive: true,
    ...overrides,
  };
}

describe("channels/registry resolveAdapter", () => {
  let whatsappMetaAdapter: ChannelAdapter;

  beforeEach(() => {
    // The registry module holds module-level state (a Map), so every test
    // re-registers from a clean slate instead of relying on registration
    // order across test files.
    whatsappMetaAdapter = makeFakeAdapter();
    registerAdapter("whatsapp", "meta", whatsappMetaAdapter);
  });

  it("returns the adapter for a known channel/provider pair", () => {
    const connection = makeConnection();

    const adapter = resolveAdapter("whatsapp", "meta", connection);

    expect(adapter).toBe(whatsappMetaAdapter);
  });

  it("throws AdapterNotFoundError for an unknown channel and calls zero adapters", () => {
    const connection = makeConnection({
      // Cast through unknown: this connection was read for a channel the
      // registry never registered an adapter for — the exact fail-closed
      // case this test protects.
      channel: "telegram" as unknown as ChannelConnection["channel"],
      provider: "telegram-bot-api" as unknown as ChannelConnection["provider"],
    });

    expect(() =>
      resolveAdapter(
        "telegram" as unknown as Parameters<typeof resolveAdapter>[0],
        "telegram-bot-api" as unknown as Parameters<typeof resolveAdapter>[1],
        connection,
      ),
    ).toThrow(AdapterNotFoundError);
    expect(whatsappMetaAdapter.normalize).not.toHaveBeenCalled();
    expect(whatsappMetaAdapter.fetchMedia).not.toHaveBeenCalled();
    expect(whatsappMetaAdapter.send).not.toHaveBeenCalled();
  });

  it("throws on a provider mismatch and calls zero adapters", () => {
    const connection = makeConnection({ provider: "meta" });

    expect(() =>
      resolveAdapter(
        "whatsapp",
        "twilio" as unknown as Parameters<typeof resolveAdapter>[1],
        connection,
      ),
    ).toThrow(AdapterNotFoundError);
    expect(whatsappMetaAdapter.normalize).not.toHaveBeenCalled();
    expect(whatsappMetaAdapter.fetchMedia).not.toHaveBeenCalled();
    expect(whatsappMetaAdapter.send).not.toHaveBeenCalled();
  });

  it("throws when the connection is missing/foreign to the channel and calls zero adapters", () => {
    expect(() => resolveAdapter("whatsapp", "meta", null)).toThrow(
      AdapterNotFoundError,
    );

    const foreignConnection = makeConnection({
      channel: "telegram" as unknown as ChannelConnection["channel"],
    });
    expect(() =>
      resolveAdapter("whatsapp", "meta", foreignConnection),
    ).toThrow(AdapterNotFoundError);

    expect(whatsappMetaAdapter.normalize).not.toHaveBeenCalled();
    expect(whatsappMetaAdapter.fetchMedia).not.toHaveBeenCalled();
    expect(whatsappMetaAdapter.send).not.toHaveBeenCalled();
  });
});
