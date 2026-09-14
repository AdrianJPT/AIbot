import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Credential, User } from "@prisma/client";
import type { ChannelConnection } from "../contracts";

const credentialFindUnique = vi.fn();
const credentialFindFirst = vi.fn();
const appConfigFindUnique = vi.fn();

vi.mock("../../db", () => ({
  prisma: {
    credential: {
      findUnique: (...args: unknown[]) => credentialFindUnique(...args),
      findFirst: (...args: unknown[]) => credentialFindFirst(...args),
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

const { resolveChannelCredential, CredentialAuthorizationError } =
  await import("../credentials");

const TENANT_OWNER_ID = "owner_tenant";
const ADMIN_OWNER_ID = "owner_admin";
const OTHER_OWNER_ID = "owner_other_client";

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

/** Shared `Credential.owner` fixture — role defaults to the tenant so most tests only need to override `id`/`role` for the admin/foreign-owner cases. */
function makeOwner(overrides: Partial<User> = {}): User {
  return {
    id: TENANT_OWNER_ID,
    email: "owner@example.com",
    name: null,
    avatarUrl: null,
    role: "client",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

type CredentialWithOwner = Credential & { owner: User };

function makeCredential(
  overrides: Partial<CredentialWithOwner> = {},
): CredentialWithOwner {
  return {
    id: "cred_1",
    ownerId: TENANT_OWNER_ID,
    kind: "whatsapp",
    provider: "meta",
    label: "Tenant credential",
    encryptedKey: "enc:cred_1",
    keyLast4: "1234",
    baseUrl: null,
    isActive: true,
    priority: 0,
    lastUsedAt: null,
    lastError: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    owner: makeOwner(),
    ...overrides,
  };
}

describe("channels/credentials resolveChannelCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decryptSecret.mockImplementation((stored: string) => `decrypted:${stored}`);
  });

  it("uses the active tenant-owned credential when there is no explicit pin, without querying the admin default", async () => {
    const connection = makeConnection({ credentialId: null });
    const tenantCredential = makeCredential({ id: "cred_tenant" });
    credentialFindFirst.mockResolvedValue(tenantCredential);

    const secret = await resolveChannelCredential(connection, TENANT_OWNER_ID);

    expect(secret).toBe("decrypted:enc:cred_1");
    expect(credentialFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: TENANT_OWNER_ID,
          kind: "whatsapp",
          provider: "meta",
          isActive: true,
        }),
      }),
    );
    expect(appConfigFindUnique).not.toHaveBeenCalled();
  });

  it("uses an explicitly assigned admin-owned credential pin when it is active and provider-compatible", async () => {
    const connection = makeConnection({ credentialId: "cred_admin" });
    credentialFindUnique.mockResolvedValue(
      makeCredential({
        id: "cred_admin",
        ownerId: ADMIN_OWNER_ID,
        encryptedKey: "enc:cred_admin",
        owner: makeOwner({ id: ADMIN_OWNER_ID, role: "admin" }),
      }),
    );

    const secret = await resolveChannelCredential(connection, TENANT_OWNER_ID);

    expect(secret).toBe("decrypted:enc:cred_admin");
    expect(credentialFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cred_admin" } }),
    );
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(appConfigFindUnique).not.toHaveBeenCalled();
  });

  it("falls back to the admin default only when the tenant has no credential of its own", async () => {
    const connection = makeConnection({ credentialId: null });
    credentialFindFirst.mockResolvedValue(null);
    appConfigFindUnique.mockResolvedValue({
      id: "default",
      whatsappCredentialId: "cred_default",
    });
    credentialFindUnique.mockResolvedValue(
      makeCredential({
        id: "cred_default",
        ownerId: ADMIN_OWNER_ID,
        encryptedKey: "enc:cred_default",
        owner: makeOwner({ id: ADMIN_OWNER_ID, role: "admin" }),
      }),
    );

    const secret = await resolveChannelCredential(connection, TENANT_OWNER_ID);

    expect(secret).toBe("decrypted:enc:cred_default");
    expect(credentialFindFirst).toHaveBeenCalledTimes(1);
    expect(appConfigFindUnique).toHaveBeenCalledWith({
      where: { id: "default" },
    });
  });

  it("denies with zero fallback when the explicit pin does not exist, and never decrypts or queries further", async () => {
    const connection = makeConnection({ credentialId: "cred_missing" });
    credentialFindUnique.mockResolvedValue(null);

    await expect(
      resolveChannelCredential(connection, TENANT_OWNER_ID),
    ).rejects.toThrow(CredentialAuthorizationError);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(appConfigFindUnique).not.toHaveBeenCalled();
  });

  it("denies with zero fallback when the explicit pin is inactive, and never decrypts", async () => {
    const connection = makeConnection({ credentialId: "cred_inactive" });
    credentialFindUnique.mockResolvedValue(
      makeCredential({ id: "cred_inactive", isActive: false }),
    );

    await expect(
      resolveChannelCredential(connection, TENANT_OWNER_ID),
    ).rejects.toThrow(CredentialAuthorizationError);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(appConfigFindUnique).not.toHaveBeenCalled();
  });

  it("denies with zero fallback when the explicit pin's provider does not match the connection, and never decrypts", async () => {
    const connection = makeConnection({ credentialId: "cred_wrong_provider" });
    credentialFindUnique.mockResolvedValue(
      makeCredential({
        id: "cred_wrong_provider",
        provider: "twilio" as unknown as Credential["provider"],
      }),
    );

    await expect(
      resolveChannelCredential(connection, TENANT_OWNER_ID),
    ).rejects.toThrow(CredentialAuthorizationError);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(appConfigFindUnique).not.toHaveBeenCalled();
  });

  it("denies with zero fallback when the explicit pin is owned by neither the tenant nor an admin, and never decrypts", async () => {
    const connection = makeConnection({ credentialId: "cred_foreign" });
    credentialFindUnique.mockResolvedValue(
      makeCredential({
        id: "cred_foreign",
        ownerId: OTHER_OWNER_ID,
        owner: makeOwner({ id: OTHER_OWNER_ID }),
      }),
    );

    await expect(
      resolveChannelCredential(connection, TENANT_OWNER_ID),
    ).rejects.toThrow(CredentialAuthorizationError);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(appConfigFindUnique).not.toHaveBeenCalled();
  });

  it("denies with zero fallback when the tenant has no credential and no admin default is configured", async () => {
    const connection = makeConnection({ credentialId: null });
    credentialFindFirst.mockResolvedValue(null);
    appConfigFindUnique.mockResolvedValue({
      id: "default",
      whatsappCredentialId: null,
    });

    await expect(
      resolveChannelCredential(connection, TENANT_OWNER_ID),
    ).rejects.toThrow(CredentialAuthorizationError);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(credentialFindUnique).not.toHaveBeenCalled();
  });
});
