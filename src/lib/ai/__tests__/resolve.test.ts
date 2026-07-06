import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, Credential } from "@prisma/client";

const credentialFindUnique = vi.fn();
const credentialFindFirst = vi.fn();
const credentialUpdate = vi.fn();
const appConfigFindUnique = vi.fn();

vi.mock("../../db", () => ({
  prisma: {
    credential: {
      findUnique: (...args: unknown[]) => credentialFindUnique(...args),
      findFirst: (...args: unknown[]) => credentialFindFirst(...args),
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

const { getAiClient, callWithFailover, resolveModels } = await import("../resolve");

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
    status: "active",
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
  appConfigFindUnique.mockResolvedValue(null);
});

describe("getAiClient resolution order", () => {
  it("uses business.aiCredentialId when set", async () => {
    const credential = makeCredential({ id: "cred_business" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: "cred_business" });

    const { client, credential: resolved } = await getAiClient(business);

    expect(credentialFindUnique).toHaveBeenCalledWith({ where: { id: "cred_business" } });
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(resolved?.id).toBe("cred_business");
    expect((client as unknown as FakeOpenAIInstance).apiKey).toBe("decrypted:enc:cred_1");
  });

  it("falls back to the owner's active AI credential when business has none set", async () => {
    const credential = makeCredential({ id: "cred_owner_active" });
    credentialFindFirst.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: null });

    const { credential: resolved } = await getAiClient(business);

    expect(credentialFindFirst).toHaveBeenCalledWith({
      where: { ownerId: "owner_1", kind: "ai", status: "active" },
    });
    expect(resolved?.id).toBe("cred_owner_active");
  });

  it("throws a clear error when neither business nor owner has a credential", async () => {
    credentialFindFirst.mockResolvedValue(null);
    appConfigFindUnique.mockResolvedValue(null);
    const business = makeBusiness({ aiCredentialId: null, ownerId: null });

    await expect(getAiClient(business)).rejects.toThrow(
      /No AI credential is configured/
    );
  });

  it("falls back to AppConfig.aiCredentialId before the owner's active credential", async () => {
    const credential = makeCredential({ id: "cred_appconfig" });
    appConfigFindUnique.mockResolvedValue({ aiCredentialId: "cred_appconfig" });
    credentialFindUnique.mockResolvedValue(credential);
    const business = makeBusiness({ aiCredentialId: null });

    const { credential: resolved } = await getAiClient(business);

    expect(credentialFindUnique).toHaveBeenCalledWith({ where: { id: "cred_appconfig" } });
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(resolved?.id).toBe("cred_appconfig");
  });
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

    await getAiClient(business);
    await getAiClient(business);

    expect(openAiCtor).toHaveBeenCalledTimes(1);
  });

  it("builds a new client when updatedAt changes (rotation)", async () => {
    const business = makeBusiness({ aiCredentialId: "cred_rotate" });
    credentialFindUnique.mockResolvedValueOnce(
      makeCredential({ id: "cred_rotate", updatedAt: new Date("2026-01-01T00:00:00.000Z") })
    );
    await getAiClient(business);

    credentialFindUnique.mockResolvedValueOnce(
      makeCredential({ id: "cred_rotate", updatedAt: new Date("2026-02-01T00:00:00.000Z") })
    );
    await getAiClient(business);

    expect(openAiCtor).toHaveBeenCalledTimes(2);
  });
});

describe("callWithFailover", () => {
  it("retries once on the owner's standby credential after a 401 from the primary", async () => {
    const active = makeCredential({ id: "cred_active", status: "active" });
    const standby = makeCredential({ id: "cred_standby", status: "standby" });
    credentialFindFirst
      .mockResolvedValueOnce(active) // resolve active credential
      .mockResolvedValueOnce(standby); // resolve standby on failover

    const business = makeBusiness({ aiCredentialId: null });

    const fn = vi
      .fn()
      .mockImplementationOnce(() => {
        const err = new Error("Unauthorized") as Error & { status: number };
        err.status = 401;
        throw err;
      })
      .mockImplementationOnce(async (client: FakeOpenAIInstance) => {
        expect(client.apiKey).toBe("decrypted:enc:cred_1");
        return "ok-from-standby";
      });

    const result = await callWithFailover(business, fn);

    expect(result).toBe("ok-from-standby");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "credentials",
      expect.any(String),
      expect.objectContaining({ credentialId: "cred_active" }),
      business.id
    );
    expect(credentialUpdate).toHaveBeenCalledWith({
      where: { id: "cred_active" },
      data: { lastError: "Unauthorized" },
    });
  });

  it("rethrows when there is no standby credential to fail over to", async () => {
    const active = makeCredential({ id: "cred_active", status: "active" });
    credentialFindFirst
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(null); // no standby found

    const business = makeBusiness({ aiCredentialId: null });
    const err = new Error("Forbidden") as Error & { status: number };
    err.status = 403;
    const fn = vi.fn().mockRejectedValue(err);

    await expect(callWithFailover(business, fn)).rejects.toThrow("Forbidden");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fail over on non-auth errors", async () => {
    const active = makeCredential({ id: "cred_active", status: "active" });
    credentialFindFirst.mockResolvedValueOnce(active);

    const business = makeBusiness({ aiCredentialId: null });
    const fn = vi.fn().mockRejectedValue(new Error("network blip"));

    await expect(callWithFailover(business, fn)).rejects.toThrow("network blip");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
