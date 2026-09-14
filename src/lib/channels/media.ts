import type { PhoneNumber } from "@prisma/client";
import type { Channel } from "./contracts";
import { downloadMediaBuffer } from "../media";
import { resolveWhatsappToken } from "../whatsapp";

/**
 * Channel-neutral media delegation boundary (design's "Routing/credentials"
 * decision: media authorization precedes fetch). Domain callers that need
 * inbound media bytes — `message-handler.ts`'s content parser and
 * `payments/analysis-job.ts`'s proof download — resolve a per-channel
 * `MediaFetcher` through `fetchChannelMedia` instead of importing a
 * WhatsApp-specific `resolveWhatsappToken`/`downloadMediaBuffer` pair
 * directly. Mirrors the fail-closed lookup shape of `resolveAdapter` in
 * `./registry.ts`, scoped to media instead of full adapter dispatch: today
 * only WhatsApp/Meta is registered, but a caller never needs to know that.
 *
 * `ChannelAdapter.fetchMedia` (contracts.ts) is the eventual, fully
 * generalized target for this — WhatsApp's adapter implementation of it is
 * still deferred (see `channels/whatsapp.ts`). This boundary exists so
 * domain callers stop reaching past the registry for WhatsApp specifics
 * today, without waiting on that adapter work to land.
 */

export type MediaFetchResult = { buffer: Buffer; mimeType: string };

/**
 * Authorizes then fetches inbound media for one channel. `fetchChannelMedia`
 * below always awaits `authorize` before calling `fetch` — enforcing
 * design's "media authorization precedes fetch" requirement by call order,
 * not just by convention.
 */
interface MediaFetcher {
  authorize(phoneNumber: PhoneNumber, ownerId: string): Promise<string>;
  fetch(externalMediaId: string, token: string): Promise<MediaFetchResult>;
}

/** Thrown by `resolveMediaFetcher` for a channel with no registered fetcher. */
export class MediaFetcherNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaFetcherNotFoundError";
  }
}

const fetchers = new Map<Channel, MediaFetcher>([
  ["whatsapp", { authorize: resolveWhatsappToken, fetch: downloadMediaBuffer }],
]);

/** Fail-closed lookup, same shape as `registry.ts`'s `resolveAdapter`. */
export function resolveMediaFetcher(channel: Channel): MediaFetcher {
  const fetcher = fetchers.get(channel);
  if (!fetcher) {
    throw new MediaFetcherNotFoundError(
      `No media fetcher registered for channel "${channel}"`,
    );
  }
  return fetcher;
}

/**
 * Channel-neutral entry point: resolves the fetcher for `channel`,
 * authorizes, then fetches — in that order, unconditionally. Callers never
 * import a channel-specific token/download function directly.
 */
export async function fetchChannelMedia(
  channel: Channel,
  phoneNumber: PhoneNumber,
  ownerId: string,
  externalMediaId: string,
): Promise<MediaFetchResult> {
  const fetcher = resolveMediaFetcher(channel);
  const token = await fetcher.authorize(phoneNumber, ownerId);
  return fetcher.fetch(externalMediaId, token);
}
