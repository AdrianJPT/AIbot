import OpenAI from "openai";
import type { AppConfig, Business, Credential } from "@prisma/client";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { logEvent } from "../log";

const FALLBACK_MODELS = {
  chatModel: "gpt-4o-mini",
  visionModel: "gpt-4o-mini",
  audioModel: "whisper-1",
};

function getAppConfig(): Promise<AppConfig | null> {
  return prisma.appConfig.findUnique({ where: { id: "default" } });
}

export type ResolvedModels = {
  chatModel: string;
  visionModel: string;
  audioModel: string;
};

/**
 * Resolves the models to use for a business: its own override, else the
 * admin-managed AppConfig default, else a hardcoded last-resort fallback.
 * Keeping this data-driven (not a code constant) means rolling a new model
 * out to every client is a Settings save, not a deploy.
 */
export async function resolveModels(business: Business): Promise<ResolvedModels> {
  const config = await getAppConfig();
  return {
    chatModel: business.model || config?.chatModel || FALLBACK_MODELS.chatModel,
    visionModel: business.visionModel || config?.visionModel || FALLBACK_MODELS.visionModel,
    audioModel: business.audioModel || config?.audioModel || FALLBACK_MODELS.audioModel,
  };
}

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
};

const CLIENT_CACHE_MAX_ENTRIES = 50;
const clientCache = new Map<string, OpenAI>();

function cacheKeyFor(credential: Credential): string {
  return `${credential.id}:${credential.updatedAt.getTime()}`;
}

function getOrBuildClient(key: string, build: () => OpenAI): OpenAI {
  const existing = clientCache.get(key);
  if (existing) return existing;

  const client = build();
  if (clientCache.size >= CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = clientCache.keys().next().value;
    if (oldestKey !== undefined) clientCache.delete(oldestKey);
  }
  clientCache.set(key, client);
  return client;
}

function buildClientForCredential(credential: Credential): OpenAI {
  return getOrBuildClient(cacheKeyFor(credential), () => {
    const apiKey = decryptSecret(credential.encryptedKey);
    const baseURL = credential.baseUrl || PROVIDER_BASE_URLS[credential.provider];
    return new OpenAI({ apiKey, baseURL });
  });
}

export type ResolvedAiClient = {
  client: OpenAI;
  credential: Credential | null;
};

/**
 * Resolves the OpenAI-compatible client to use for a business's AI calls.
 * Resolution order: business.aiCredentialId -> AppConfig.aiCredentialId
 * (admin default) -> throw. AI keys are managed exclusively in
 * /settings/credentials — there is no environment-variable fallback.
 */
export async function getAiClient(business: Business): Promise<ResolvedAiClient> {
  let credential: Credential | null = null;

  if (business.aiCredentialId) {
    credential = await prisma.credential.findUnique({
      where: { id: business.aiCredentialId },
    });
  }

  if (!credential) {
    const config = await getAppConfig();
    if (config?.aiCredentialId) {
      credential = await prisma.credential.findUnique({
        where: { id: config.aiCredentialId },
      });
    }
  }

  if (!credential) {
    throw new Error(
      "No AI credential is configured for this business. Add one in /settings/credentials."
    );
  }

  return { client: buildClientForCredential(credential), credential };
}

function extractStatus(err: unknown): number | undefined {
  const withStatus = err as { status?: number; response?: { status?: number } };
  return withStatus?.status ?? withStatus?.response?.status;
}

/**
 * Extracts the provider's error code/type, if any. The openai SDK's
 * `APIError` (see node_modules/openai/src/error.ts) exposes `code`/`type`
 * as top-level properties on the error instance itself (populated from the
 * response body's `error.code`/`error.type`), not nested under `.error` —
 * so that's checked first. The nested shapes are kept as a defensive
 * fallback for any non-SDK error that reached this call some other way
 * (e.g. a raw fetch failure surfaced by a custom baseURL provider).
 */
function extractErrorCode(err: unknown): string | undefined {
  const e = err as {
    code?: string | null;
    type?: string | null;
    error?: { code?: string | null; type?: string | null };
    response?: { data?: { error?: { code?: string | null; type?: string | null } } };
  };
  return (
    e?.code ??
    e?.type ??
    e?.error?.code ??
    e?.error?.type ??
    e?.response?.data?.error?.code ??
    e?.response?.data?.error?.type ??
    undefined
  ) ?? undefined;
}

/**
 * 401/403 (bad/revoked key) and 429 (rate limit/quota) are all cases where
 * retrying against the *same* credential unconditionally would be pointless
 * or wasteful — they share the same "give up on this credential and tell
 * the admin" bookkeeping path below. 429 additionally gets one short retry
 * first (see RETRY_DELAY_MS) since those often clear in under a second.
 */
function isFailoverEligible(err: unknown): boolean {
  const status = extractStatus(err);
  return status === 401 || status === 403 || status === 429;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RATE_LIMIT_RETRY_DELAY_MS = 800;

/**
 * Resolves a client for the business and invokes fn with it. On success,
 * marks the credential as recently used and clears any prior error
 * (best-effort — a failure to persist this bookkeeping shouldn't fail the
 * call).
 *
 * On a 429 (rate limit/quota), does ONE short retry against the SAME
 * client/credential first — transient rate limits often clear in under a
 * second, and retrying beats failing straight to the generic fallback
 * reply. If that retry also fails (or the error was 401/403 to begin
 * with), persists lastError on the credential and logs an EventLog with
 * source "credentials", then rethrows — there is no standby credential to
 * fail over to anymore, so the caller (or the admin, via
 * /settings/credentials) has to fix the key.
 */
export async function callWithAiCredential<T>(
  business: Business,
  fn: (client: OpenAI) => Promise<T>
): Promise<T> {
  const { client, credential } = await getAiClient(business);

  const markSuccess = async () => {
    if (credential) {
      await prisma.credential
        .update({
          where: { id: credential.id },
          data: { lastUsedAt: new Date(), lastError: null },
        })
        .catch(() => undefined);
    }
  };

  let err: unknown;
  try {
    const result = await fn(client);
    await markSuccess();
    return result;
  } catch (firstErr) {
    err = firstErr;
  }

  if (extractStatus(err) === 429) {
    await delay(RATE_LIMIT_RETRY_DELAY_MS);
    try {
      const result = await fn(client);
      await markSuccess();
      return result;
    } catch (retryErr) {
      err = retryErr;
    }
  }

  if (!credential || !isFailoverEligible(err)) {
    throw err;
  }

  const code = extractErrorCode(err);
  // 401/403 (bad/revoked key) and 429 (rate limit/quota) share the same
  // failover bookkeeping path, but they mean very different things to an
  // admin glancing at /settings/credentials: one means "this key is broken,
  // replace it", the other means "this key is fine, it's just being
  // throttled right now". Prefix the 429 case so lastError distinguishes
  // them instead of showing an identical-looking destructive-red message
  // for both.
  const persistedMessage =
    extractStatus(err) === 429 ? `Rate limited: ${errorMessage(err)}` : errorMessage(err);
  await logEvent(
    "error",
    "credentials",
    "AI credential auth failure",
    { error: persistedMessage, credentialId: credential.id, code },
    business.id
  );

  await prisma.credential
    .update({
      where: { id: credential.id },
      data: { lastError: persistedMessage },
    })
    .catch(() => undefined);

  throw err;
}
