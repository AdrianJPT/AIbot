import type { Credential, User } from "@prisma/client";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import type { Channel, ChannelConnection } from "./contracts";

/**
 * Channel-neutral, fail-closed credential authorization boundary (design's
 * "Routing/credentials" decision). Resolves the decrypted secret a
 * `ChannelConnection` is authorized to use, mirroring `registry.ts`'s
 * `resolveAdapter` and `media.ts`'s `resolveMediaFetcher` fail-closed shape:
 * every rejection path throws before any credential is decrypted, so a
 * denied connection never has a secret exposed.
 *
 * Resolution order, per design:
 *   1. An explicit pin (`connection.credentialId`) is validated strictly —
 *      it must be active, provider-compatible, and either tenant-owned or
 *      explicitly assigned admin-owned. An invalid pin NEVER falls back to
 *      anything else; it denies outright, matching `ai/resolve.ts`'s
 *      `business.aiCredentialId` pin convention.
 *   2. With no pin, the tenant's own active/provider-compatible credential
 *      wins if one exists (ordered by priority asc, then createdAt asc,
 *      the same convention as `ai/resolve.ts`'s fallback chain).
 *   3. Only when the tenant has no credential of its own does the
 *      admin-managed platform default apply (today: `AppConfig`'s
 *      `whatsappCredentialId`, generalized here via `ADMIN_DEFAULT_LOOKUP`
 *      so a future channel just adds an entry).
 */

/** Thrown for every fail-closed denial: unknown channel, missing/invalid pin, or no usable credential at all. Never thrown after a secret has been decrypted. */
export class CredentialAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialAuthorizationError";
  }
}

type CredentialWithOwner = Credential & { owner: User };

/** Maps a channel to the `Credential.kind` it authorizes against. */
const CREDENTIAL_KIND_BY_CHANNEL: Partial<Record<Channel, string>> = {
  whatsapp: "whatsapp",
};

function credentialKindForChannel(channel: Channel): string {
  const kind = CREDENTIAL_KIND_BY_CHANNEL[channel];
  if (!kind) {
    throw new CredentialAuthorizationError(
      `No credential kind mapped for channel "${channel}"`,
    );
  }
  return kind;
}

/**
 * Per-channel lookup of the admin-managed platform default credential id.
 * Mirrors `media.ts`'s per-channel `Map` registry shape. Whatsapp's default
 * is `AppConfig.whatsappCredentialId` — the same singleton row
 * `resolveWhatsappToken` and `ai/resolve.ts`'s `resolveModels` already read.
 */
const ADMIN_DEFAULT_LOOKUP = new Map<Channel, () => Promise<string | null>>([
  [
    "whatsapp",
    async () => {
      const config = await prisma.appConfig.findUnique({
        where: { id: "default" },
      });
      return config?.whatsappCredentialId ?? null;
    },
  ],
]);

/** True when a credential is active and matches the required kind/provider. Ownership is checked separately since it only applies to explicit pins. */
function isUsable(
  credential: Credential,
  kind: string,
  provider: string,
): boolean {
  return (
    credential.isActive &&
    credential.kind === kind &&
    credential.provider === provider
  );
}

/**
 * Returns an already-authorized credential's secret and records its use.
 * The write is deliberately best-effort: credential authorization and
 * decryption have already succeeded, so a telemetry failure must not turn a
 * valid outbound request into a credential denial. This mirrors the
 * best-effort success bookkeeping pattern in `ai/resolve.ts`.
 */
async function decryptAndMarkCredential(
  credential: Credential,
): Promise<string> {
  const secret = decryptSecret(credential.encryptedKey);
  await prisma.credential
    .update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);
  return secret;
}

/**
 * Validates and decrypts an explicit `connection.credentialId` pin. Never
 * falls back to the tenant chain or the admin default — a pin that fails
 * validation for any reason denies outright.
 */
async function resolvePinnedCredential(
  credentialId: string,
  tenantOwnerId: string,
  kind: string,
  provider: string,
): Promise<string> {
  const credential = (await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { owner: true },
  })) as CredentialWithOwner | null;

  if (!credential || !isUsable(credential, kind, provider)) {
    throw new CredentialAuthorizationError(
      `Credential "${credentialId}" is not a valid, active, provider-compatible credential`,
    );
  }

  const isTenantOwned = credential.ownerId === tenantOwnerId;
  const isAdminOwned = credential.owner.role === "admin";
  if (!isTenantOwned && !isAdminOwned) {
    throw new CredentialAuthorizationError(
      `Credential "${credentialId}" is not tenant-owned or explicitly assigned admin-owned`,
    );
  }

  return decryptAndMarkCredential(credential);
}

/**
 * Resolves the decrypted secret for `connection`, exhaustively and
 * fail-closed. `tenantOwnerId` is the connection's business's owner id
 * (caller-resolved, same convention as `resolveWhatsappToken`'s `ownerId`
 * and `fetchChannelMedia`'s `ownerId`).
 */
export async function resolveChannelCredential(
  connection: ChannelConnection,
  tenantOwnerId: string,
): Promise<string> {
  const kind = credentialKindForChannel(connection.channel);

  if (connection.credentialId) {
    return resolvePinnedCredential(
      connection.credentialId,
      tenantOwnerId,
      kind,
      connection.provider,
    );
  }

  const tenantCredential = await prisma.credential.findFirst({
    where: {
      ownerId: tenantOwnerId,
      kind,
      provider: connection.provider,
      isActive: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (tenantCredential) {
    return decryptAndMarkCredential(tenantCredential);
  }

  const resolveDefaultId = ADMIN_DEFAULT_LOOKUP.get(connection.channel);
  const defaultId = resolveDefaultId ? await resolveDefaultId() : null;
  const adminDefault = defaultId
    ? await prisma.credential.findUnique({ where: { id: defaultId } })
    : null;

  if (!adminDefault || !isUsable(adminDefault, kind, connection.provider)) {
    throw new CredentialAuthorizationError(
      `No credential is configured for connection "${connection.id}": the tenant has none and no valid admin default exists`,
    );
  }

  return decryptAndMarkCredential(adminDefault);
}
