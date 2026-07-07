import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, Credential } from "@prisma/client";

const credentialFindUnique = vi.fn();
const credentialFindMany = vi.fn();
const credentialUpdate = vi.fn();
const appConfigFindUnique = vi.fn();

vi.mock("../../db", () => ({
  prisma: {
    credential: {
      findUnique: (...args: unknown[]) => credentialFindUnique(...args),
      findMany: (...args: unknown[]) => credentialFindMany(...args),
      update: (...args: unknown[]) => credentialUpdate(...args),
    },
    appConfig: {
      findUnique: (...args: unknown[]) => appConfigFindUnique(...args),
    },
  },
}));

const decryptSecret = vi.fn((stored: string) => `decrypted:${stored}`);
vi.mock("../../crypto", () => ({
  decryptSecret: (...args: unknown[]) => decryptSecret(...(args as [string])),
}));

const logEvent = vi.fn();
vi.mock("../../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

type FakeOpenAIInstance = { apiKey?: string; baseURL?: string };
const openAiCtor = vi.fn(
  (config: { apiKey?: string; baseURL?: string }): FakeOpenAIInstance => ({ ...config })
);
vi.mock("openai", () => ({
  default: class {
    apiKey?: string;
    baseURL?: string;
    constructor(config: { apiKey?: string; baseURL?: string }) {
      const instance = openAiCtor(config);
      this.apiKey = instance.apiKey;
      this.baseURL = instance.baseURL;
    }
  },
}));

const { callWithAiCredential, resolveModels } = await import("../resolve");

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz_1",
    name: "Test Business",
    wabaId: null,
    systemPrompt: "prompt",
    welcomeMessage: "welcome",
    businessInfo: {},
    model: "gpt-4o-mini",
    visionModel: null,
    audioModel: null,
    maxHistoryMessages: 20,
    dailyAiLimit: 1000,
    isActive: true,
    ownerId: "owner_1",
    aiCredentialId: null,
    createdAt: new Date(),
    ...overrides,
  } as Business;
}

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: "cred_1",
    ownerId: "owner_1",
    kind: "ai",
    provider: "openai",
    label: "Prod key",
    encryptedKey: "enc:cred_1",
    keyLast4: "1234",
    baseUrl: null,
    isActive: true,
    priority: 0,
    lastUsedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as Credential;
}

beforeEach(() => {
  vi.clearAllMocks();
  decryptSecret.mockImplementation((stored: string) => `decrypted:${stored}`);
  credentialUpdate.mockResolvedValue({});
  credentialFindMany.mockResolvedValue([]);
  appConfigFindUnique.mockResolvedValue(null);
});

describe("resolveModels", () => {
  it("uses the business override when set", async () => {
    const business = makeBusiness({ model: "biz-chat", visionModel: "biz-vision", audioModel: "biz-audio" });

    const models = await resolveModels(business);

    expect(models).toEqual({
      chatModel: "biz-chat",
      visionModel: "biz-vision",
      audioModel: "biz-audio",
    });
  });

  it("falls back to AppConfig when the business has no override", async () => {
    appConfigFindUnique.mockResolvedValue({
      chatModel: "config-chat",
      visionModel: "config-vision",
      audioModel: "config-audio",
    });
    const business = makeBusiness({ model: null, visionModel: null, audioModel: null });

    const models = await resolveModels(business);

    expect(models).toEqual({
      chatModel: "config-chat",
      visionModel: "config-vision",
      audioModel: "config-audio",
    });
  });

  it("falls back to the hardcoded default when neither business nor AppConfig has one", async () => {
    appConfigFindUnique.mockResolvedValue(null);
    const business = makeBusiness({ model: null, visionModel: null, audioModel: null });

    const models = await resolveModels(business);

    expect(models).toEqual({
      chatModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      audioModel: "whisper-1",
    });
  });
});

describe("client caching", () => {
  it("reuses the cached client for the same credential id + updatedAt", async () => {
    const credential = makeCredential({ id: "cred_cache" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_cache" });
    const fn = vi.fn().mockResolvedValue("ok");

    await callWithAiCredential(business, fn);
    await callWithAiCredential(business, fn);

    expect(openAiCtor).toHaveBeenCalledTimes(1);
  });

  it("builds a new client when updatedAt changes (rotation)", async () => {
    const business = makeBusiness({ aiCredentialId: "cred_rotate" });
    const fn = vi.fn().mockResolvedValue("ok");
    credentialFindUnique.mockResolvedValueOnce(
      makeCredential({ id: "cred_rotate", updatedAt: new Date("2026-01-01T00:00:00.000Z") })
    );
    await callWithAiCredential(business, fn);

    credentialFindUnique.mockResolvedValueOnce(
      makeCredential({ id: "cred_rotate", updatedAt: new Date("2026-02-01T00:00:00.000Z") })
    );
    await callWithAiCredential(business, fn);

    expect(openAiCtor).toHaveBeenCalledTimes(2);
  });

  it("builds each client with an explicit timeout and maxRetries:0, since callWithAiCredential owns its own retry policy", async () => {
    const credential = makeCredential({ id: "cred_opts" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_opts" });

    await callWithAiCredential(business, vi.fn().mockResolvedValue("ok"));

    expect(openAiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 20_000, maxRetries: 0 })
    );
  });
});

describe("callWithAiCredential — explicit pin (business.aiCredentialId set)", () => {
  it("bypasses the chain entirely: only queries the single pinned credential", async () => {
    const credential = makeCredential({ id: "cred_active" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_active" });

    const fn = vi.fn().mockResolvedValue("ok");

    const result = await callWithAiCredential(business, fn);

    expect(result).toBe("ok");
    expect(credentialFindUnique).toHaveBeenCalledWith({
      where: { id: "cred_active", isActive: true, kind: "ai" },
    });
    expect(credentialFindMany).not.toHaveBeenCalled();
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_active" },
      data: { lastUsedAt: expect.any(Date), lastError: null },
    });
  });

  it("persists lastError and logs an EventLog, then rethrows on a 401 (no other credential to fall over to)", async () => {
    const credential = makeCredential({ id: "cred_active" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_active" });

    const err = new Error("Unauthorized") as Error & { status: number };
    err.status = 401;
    const fn = vi.fn().mockRejectedValue(err);

    await expect(callWithAiCredential(business, fn)).rejects.toThrow("Unauthorized");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "credentials",
      "AI credential auth failure",
      expect.objectContaining({ credentialId: "cred_active" }),
      business.id
    );
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_active" },
      data: { lastError: "Unauthorized" },
    });
  });

  it("persists lastError and logs even on a non-auth error, since the pin has no fallback candidate", async () => {
    const credential = makeCredential({ id: "cred_active" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_active" });

    const fn = vi.fn().mockRejectedValue(new Error("network blip"));

    await expect(callWithAiCredential(business, fn)).rejects.toThrow("network blip");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "credentials",
      "AI credential auth failure",
      expect.objectContaining({ credentialId: "cred_active", error: "network blip" }),
      business.id
    );
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_active" },
      data: { lastError: "network blip" },
    });
  });

  it("retries once on a 429 and returns the retry's result without logging", async () => {
    const credential = makeCredential({ id: "cred_active" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_active" });

    const err = new Error("Rate limited") as Error & { status: number };
    err.status = 429;
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok after retry");

    const result = await callWithAiCredential(business, fn);

    expect(result).toBe("ok after retry");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logEvent).not.toHaveBeenCalled();
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_active" },
      data: { lastUsedAt: expect.any(Date), lastError: null },
    });
  }, 3000);

  it("logs and rethrows with the provider error code when the retry after a 429 also fails", async () => {
    const credential = makeCredential({ id: "cred_active" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_active" });

    const err = new Error("Rate limited") as Error & { status: number; code: string };
    err.status = 429;
    err.code = "rate_limit_exceeded";
    const fn = vi.fn().mockRejectedValue(err);

    await expect(callWithAiCredential(business, fn)).rejects.toThrow("Rate limited");

    expect(fn).toHaveBeenCalledTimes(2);
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "credentials",
      "AI credential auth failure",
      expect.objectContaining({
        credentialId: "cred_active",
        code: "rate_limit_exceeded",
        error: "Rate limited: Rate limited",
      }),
      business.id
    );
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_active" },
      data: { lastError: "Rate limited: Rate limited" },
    });
  }, 3000);

  it("prefixes lastError with 'Rate limited:' on a 429, distinguishing it from a plain 401/403 message", async () => {
    const credential = makeCredential({ id: "cred_429" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_429" });

    const err = new Error("Too many requests") as Error & { status: number };
    err.status = 429;
    const fn = vi.fn().mockRejectedValue(err);

    await expect(callWithAiCredential(business, fn)).rejects.toThrow("Too many requests");

    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_429" },
      data: { lastError: "Rate limited: Too many requests" },
    });
  });

  it("does NOT prefix lastError on a 401 — stays a plain message distinguishable from the 429 case", async () => {
    const credential = makeCredential({ id: "cred_401" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_401" });

    const err = new Error("Invalid API key") as Error & { status: number };
    err.status = 401;
    const fn = vi.fn().mockRejectedValue(err);

    await expect(callWithAiCredential(business, fn)).rejects.toThrow("Invalid API key");

    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_401" },
      data: { lastError: "Invalid API key" },
    });
  });

  it("throws the standard error when the pinned credential id doesn't resolve to any row", async () => {
    credentialFindUnique.mockResolvedValue(null);
    const business = makeBusiness({ aiCredentialId: "cred_missing" });

    await expect(callWithAiCredential(business, vi.fn())).rejects.toThrow(
      /No AI credential is configured/
    );
  });

  it("queries the pinned credential filtered by isActive:true and kind:'ai'", async () => {
    credentialFindUnique.mockResolvedValue(makeCredential({ id: "cred_active" }));
    const business = makeBusiness({ aiCredentialId: "cred_active" });

    await callWithAiCredential(business, vi.fn().mockResolvedValue("ok"));

    expect(credentialFindUnique).toHaveBeenCalledWith({
      where: { id: "cred_active", isActive: true, kind: "ai" },
    });
  });

  it("yields an empty candidate list — not a fallback to the global chain — when the pinned credential is inactive", async () => {
    // Prisma's isActive:true filter on findUnique means a deactivated pin
    // simply doesn't match, so the mock returns null exactly as the real
    // query would for a row that fails the filter.
    credentialFindUnique.mockResolvedValue(null);
    const business = makeBusiness({ aiCredentialId: "cred_inactive_pin" });

    await expect(
      callWithAiCredential(business, vi.fn().mockResolvedValue("should not be called"))
    ).rejects.toThrow(/No AI credential is configured/);

    expect(credentialFindMany).not.toHaveBeenCalled();
  });

  it("yields an empty candidate list — not a fallback to the global chain — when the pinned id points at a non-'ai' credential", async () => {
    // Same reasoning: the kind:"ai" filter on findUnique excludes a
    // "whatsapp" row, so the mock returns null.
    credentialFindUnique.mockResolvedValue(null);
    const business = makeBusiness({ aiCredentialId: "cred_wrong_kind" });

    await expect(
      callWithAiCredential(business, vi.fn().mockResolvedValue("should not be called"))
    ).rejects.toThrow(/No AI credential is configured/);

    expect(credentialFindMany).not.toHaveBeenCalled();
  });
});

describe("callWithAiCredential — global fallback chain (no business.aiCredentialId)", () => {
  it("queries every active 'ai' credential system-wide (NOT scoped by business.ownerId), ordered by priority asc, createdAt asc", async () => {
    credentialFindMany.mockResolvedValue([makeCredential({ id: "cred_1" })]);
    const business = makeBusiness({ aiCredentialId: null, ownerId: "owner_9" });

    await callWithAiCredential(business, vi.fn().mockResolvedValue("ok"));

    expect(credentialFindMany).toHaveBeenCalledWith({
      where: { kind: "ai", isActive: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
  });

  it("two businesses with different owners both see the same global active 'ai' credential chain", async () => {
    // Regression test for the bug where resolveCandidates was scoped by
    // business.ownerId: Credential rows are created with ownerId = the
    // admin's id, but Business.ownerId is very often a client's id, so
    // scoping by business.ownerId returned an empty chain for any business
    // owned by a client. The chain must be identical (and non-empty)
    // regardless of which user owns the business.
    const sharedChain = [
      makeCredential({ id: "cred_shared_1", priority: 0 }),
      makeCredential({ id: "cred_shared_2", priority: 1 }),
    ];
    credentialFindMany.mockResolvedValue(sharedChain);

    const businessOwnedByClientA = makeBusiness({ aiCredentialId: null, ownerId: "client_a" });
    const businessOwnedByClientB = makeBusiness({ aiCredentialId: null, ownerId: "client_b" });

    const resultA = await callWithAiCredential(
      businessOwnedByClientA,
      vi.fn().mockResolvedValue("ok for A")
    );
    const resultB = await callWithAiCredential(
      businessOwnedByClientB,
      vi.fn().mockResolvedValue("ok for B")
    );

    expect(resultA).toBe("ok for A");
    expect(resultB).toBe("ok for B");
    expect(credentialFindMany).toHaveBeenCalledTimes(2);
    for (const call of credentialFindMany.mock.calls) {
      expect(call[0]).toEqual({
        where: { kind: "ai", isActive: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
    }
  });

  it("uses only the first candidate on success — never calls fn against the second", async () => {
    const first = makeCredential({ id: "cred_first", priority: 0 });
    const second = makeCredential({ id: "cred_second", priority: 1 });
    credentialFindMany.mockResolvedValue([first, second]);
    const business = makeBusiness({ aiCredentialId: null });

    const fn = vi.fn().mockResolvedValue("ok");
    const result = await callWithAiCredential(business, fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_first" },
      data: { lastUsedAt: expect.any(Date), lastError: null },
    });
  });

  it("falls through to the second candidate on ANY error from the first — not just 401/403/429", async () => {
    const first = makeCredential({ id: "cred_first", priority: 0 });
    const second = makeCredential({ id: "cred_second", priority: 1 });
    credentialFindMany.mockResolvedValue([first, second]);
    const business = makeBusiness({ aiCredentialId: null });

    // A provider-doesn't-support-this-model failure — no status at all.
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("model not supported by this provider"))
      .mockResolvedValueOnce("ok from second");

    const result = await callWithAiCredential(business, fn);

    expect(result).toBe("ok from second");
    expect(fn).toHaveBeenCalledTimes(2);
    // Failure bookkeeping happened on the FIRST credential specifically.
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_first" },
      data: { lastError: "model not supported by this provider" },
    });
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "credentials",
      "AI credential auth failure",
      expect.objectContaining({ credentialId: "cred_first" }),
      business.id
    );
    // Success bookkeeping happened on the SECOND credential specifically.
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_second" },
      data: { lastUsedAt: expect.any(Date), lastError: null },
    });
  });

  it("does one 429 retry on the current candidate before advancing to the next", async () => {
    const first = makeCredential({ id: "cred_first", priority: 0 });
    const second = makeCredential({ id: "cred_second", priority: 1 });
    credentialFindMany.mockResolvedValue([first, second]);
    const business = makeBusiness({ aiCredentialId: null });

    const rateLimitErr = new Error("Rate limited") as Error & { status: number };
    rateLimitErr.status = 429;
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr) // first candidate, first try
      .mockRejectedValueOnce(rateLimitErr) // first candidate, retry after 800ms
      .mockResolvedValueOnce("ok from second"); // second candidate

    const result = await callWithAiCredential(business, fn);

    expect(result).toBe("ok from second");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_first" },
      data: { lastError: "Rate limited: Rate limited" },
    });
  }, 3000);

  it("rethrows the LAST error when every candidate in the chain fails", async () => {
    const first = makeCredential({ id: "cred_first", priority: 0 });
    const second = makeCredential({ id: "cred_second", priority: 1 });
    credentialFindMany.mockResolvedValue([first, second]);
    const business = makeBusiness({ aiCredentialId: null });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first is broken"))
      .mockRejectedValueOnce(new Error("second is broken too"));

    await expect(callWithAiCredential(business, fn)).rejects.toThrow("second is broken too");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_first" },
      data: { lastError: "first is broken" },
    });
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_second" },
      data: { lastError: "second is broken too" },
    });
  });

  it("excludes inactive credentials from the chain via the isActive:true query filter", async () => {
    // The route's `where: { isActive: true }` is what actually excludes
    // inactive rows — an inactive credential should never even be part of
    // the mocked findMany result the chain iterates over.
    const active = makeCredential({ id: "cred_active_only", isActive: true });
    credentialFindMany.mockResolvedValue([active]);
    const business = makeBusiness({ aiCredentialId: null });

    const fn = vi.fn().mockResolvedValue("ok");
    await callWithAiCredential(business, fn);

    expect(credentialFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws the standard error when the owner has no active ai credentials at all", async () => {
    credentialFindMany.mockResolvedValue([]);
    const business = makeBusiness({ aiCredentialId: null });

    await expect(callWithAiCredential(business, vi.fn())).rejects.toThrow(
      /No AI credential is configured/
    );
  });
});
