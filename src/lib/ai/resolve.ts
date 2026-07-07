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
    // Explicit timeout/maxRetries: callWithAiCredential already implements
    // its own targeted single 429-retry per candidate and iterates multiple
    // candidates, so we don't want the SDK's own defaults (10 min timeout,
    // 2 retries) compounding on top of that — an unreachable/hanging
    // baseURL on one candidate must fail fast so the chain can move on to
    // the next one instead of stalling a customer-facing WhatsApp reply.
    return new OpenAI({ apiKey, baseURL, timeout: 20_000, maxRetries: 0 });
  });
}

/**
 * Builds the ordered candidate list callWithAiCredential iterates over.
 *
 * If business.aiCredentialId is set, that's an explicit per-business pin —
 * it's respected as a hard override with NO fallback to other credentials,
 * because an admin who pinned a specific key for this business chose that
 * on purpose. The pin must still be a valid, active "ai" credential: if it
 * was deactivated or somehow points at a non-"ai" row, that's treated as
 * "no working credential for this business" (empty candidate list) rather
 * than silently falling through to the global chain — the pin is meant to
 * be an explicit override, not a soft preference.
 *
 * Otherwise the candidates are every active "ai" Credential system-wide,
 * ordered by priority ascending (ties by createdAt ascending) — this is the
 * global fallback chain, intentionally NOT scoped by business.ownerId. This
 * app has a single admin operating the whole platform: Credential rows are
 * always created with ownerId = the creating admin's id (see
 * src/app/api/credentials/route.ts), but Business.ownerId is very often a
 * client user's id, not the admin's — so scoping this query by
 * business.ownerId would return an empty chain for every business owned by
 * a client, breaking AI for the common case. This matches the old
 * AppConfig.aiCredentialId behavior it replaces, which had no ownerId
 * scoping at all (see schema.prisma's AppConfig comment).
 */
async function resolveCandidates(business: Business): Promise<Credential[]> {
  if (business.aiCredentialId) {
    const pinned = await prisma.credential.findUnique({
      where: { id: business.aiCredentialId, isActive: true, kind: "ai" },
    });
    return pinned ? [pinned] : [];
  }

  return prisma.credential.findMany({
    where: { kind: "ai", isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RATE_LIMIT_RETRY_DELAY_MS = 800;

async function markCredentialSuccess(credential: Credential): Promise<void> {
  await prisma.credential
    .update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date(), lastError: null },
    })
    .catch(() => undefined);
}

/**
 * Persists lastError on the given credential and logs an EventLog — the
 * bookkeeping an admin sees in /settings/credentials after a candidate in
 * the chain fails. 429 gets a "Rate limited: " prefix so lastError
 * distinguishes "this key is fine, just throttled right now" from every
 * other failure (bad/revoked key, unsupported model/modality, network
 * blip, ...), which all read as "this key is broken, look at it".
 */
async function recordCredentialFailure(
  business: Business,
  credential: Credential,
  err: unknown
): Promise<void> {
  const code = extractErrorCode(err);
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
}

/**
 * Calls fn against the business's ordered credential chain (see
 * resolveCandidates: the explicit business.aiCredentialId pin if set, with
 * no fallback — else every active "ai" Credential system-wide, in priority
 * order).
 *
 * Tries each candidate in turn. For the current candidate: on success,
 * marks lastUsedAt/clears lastError on THAT credential and returns
 * immediately — no further candidate is tried. On a 429, does ONE short
 * retry against the SAME credential first (transient rate limits often
 * clear in under a second) before giving up on it.
 *
 * On failure — whether it's the 429-after-retry case or ANY other error
 * (401/403, a provider that doesn't support the requested model/modality,
 * a network blip, whatever) — persists lastError on that specific
 * credential and logs an EventLog, then moves on to the next candidate.
 * There's no longer a fixed "failover-eligible" status allowlist: the
 * entire point of an ordered fallback chain is resilience regardless of
 * *why* a given credential failed. If every candidate fails, rethrows the
 * LAST error encountered so the caller's existing catch/logging is
 * unaffected.
 */
export async function callWithAiCredential<T>(
  business: Business,
  fn: (client: OpenAI) => Promise<T>
): Promise<T> {
  const candidates = await resolveCandidates(business);

  if (candidates.length === 0) {
    throw new Error(
      "No AI credential is configured for this business. Add one in /settings/credentials."
    );
  }

  let lastErr: unknown;

  for (const credential of candidates) {
    const client = buildClientForCredential(credential);

    try {
      const result = await fn(client);
      await markCredentialSuccess(credential);
      return result;
    } catch (firstErr) {
      lastErr = firstErr;
    }

    if (extractStatus(lastErr) === 429) {
      await delay(RATE_LIMIT_RETRY_DELAY_MS);
      try {
        const result = await fn(client);
        await markCredentialSuccess(credential);
        return result;
      } catch (retryErr) {
        lastErr = retryErr;
      }
    }

    await recordCredentialFailure(business, credential, lastErr);
  }

  throw lastErr;
}
