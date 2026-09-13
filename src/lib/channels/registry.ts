import type { Channel, ChannelAdapter, ChannelConnection, Provider } from "./contracts";

/**
 * Thrown by `resolveAdapter` for every fail-closed case: unknown channel, no
 * registered adapter, a provider that doesn't match the connection, or a
 * missing/foreign connection. Callers should treat this as "reject the
 * event", never as "fall back to another channel" — see the contract spec's
 * "Fail-Closed Adapter Selection" requirement.
 */
export class AdapterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterNotFoundError";
  }
}

function adapterKey(channel: Channel, provider: Provider): string {
  return `${channel}:${provider}`;
}

const adapters = new Map<string, ChannelAdapter>();

/**
 * Registers the adapter for a channel/provider pair. Adapters call this once
 * at module load (see `src/lib/channels/whatsapp.ts` in PR5) — the registry
 * itself never imports a concrete adapter, keeping the fail-closed lookup
 * exhaustive and adapter-agnostic.
 */
export function registerAdapter(
  channel: Channel,
  provider: Provider,
  adapter: ChannelAdapter,
): void {
  adapters.set(adapterKey(channel, provider), adapter);
}

/**
 * Selects the adapter for an event's declared channel/provider, scoped to
 * the tenant's connection. Every rejection path below throws before touching
 * the registered adapter — no adapter method is ever called during
 * resolution, so a rejected event dispatches zero transport code.
 *
 * Order matters: connection presence and ownership are checked before the
 * provider match, and the provider match is checked before the registry
 * lookup, so each failure reason is reported precisely instead of collapsing
 * into a generic "not found".
 */
export function resolveAdapter(
  channel: Channel,
  provider: Provider,
  connection: ChannelConnection | null | undefined,
): ChannelAdapter {
  if (!connection) {
    throw new AdapterNotFoundError(
      `No connection provided for channel "${channel}"`,
    );
  }

  if (connection.channel !== channel) {
    throw new AdapterNotFoundError(
      `Connection "${connection.id}" belongs to channel "${connection.channel}", not "${channel}"`,
    );
  }

  if (connection.provider !== provider) {
    throw new AdapterNotFoundError(
      `Connection "${connection.id}" is configured for provider "${connection.provider}", not "${provider}"`,
    );
  }

  const adapter = adapters.get(adapterKey(channel, provider));
  if (!adapter) {
    throw new AdapterNotFoundError(
      `No adapter registered for channel "${channel}" / provider "${provider}"`,
    );
  }

  return adapter;
}
