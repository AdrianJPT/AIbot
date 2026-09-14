import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PhoneNumber, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import {
  cleanupOwnershipFixtures,
  createTestCredential,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { ChannelSendError } from "@/lib/channels/send-failure";

// `sendFromNumber` (below) calls the real WhatsApp API through `axios`; mock
// it so the fail-closed credential-denial tests can assert zero send
// attempts, and so the successful-send test never reaches the network.
const { axiosPostMock } = vi.hoisted(() => ({ axiosPostMock: vi.fn() }));
vi.mock("axios", () => ({
  default: { post: (...args: unknown[]) => axiosPostMock(...args) },
}));

const { resolveWhatsappToken, sendFromNumber, sendMessage } =
  await import("@/lib/whatsapp");

describe("resolveWhatsappToken", () => {
  let owner: User;
  let phoneNumber: PhoneNumber;

  beforeAll(async () => {
    owner = await createTestUser("wa-resolve-owner");
    const business = await prisma.business.create({
      data: {
        name: "WA Resolve Biz",
        systemPrompt: "p",
        welcomeMessage: "w",
        businessInfo: {},
        ownerId: owner.id,
        phoneNumbers: { create: { phoneNumberId: `wa-resolve-${Date.now()}` } },
      },
      include: { phoneNumbers: true },
    });
    phoneNumber = business.phoneNumbers[0];
  });

  afterAll(async () => {
    await prisma.appConfig.updateMany({
      where: { id: "default" },
      data: { whatsappCredentialId: null },
    });
    await cleanupOwnershipFixtures([owner.id]);
  });

  it("throws when no credential resolves anywhere", async () => {
    await expect(resolveWhatsappToken(phoneNumber, owner.id)).rejects.toThrow(
      /No WhatsApp credential/,
    );
  });

  it("uses phoneNumber.whatsappCredentialId when set", async () => {
    const credential = await prisma.credential.create({
      data: {
        ownerId: owner.id,
        kind: "whatsapp",
        provider: "meta",
        label: "Number-specific",
        encryptedKey: encryptSecret("number-token"),
        keyLast4: "oken",
      },
    });
    const numberWithCredential = await prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { whatsappCredentialId: credential.id },
    });

    const token = await resolveWhatsappToken(numberWithCredential, owner.id);
    expect(token).toBe("number-token");

    await prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { whatsappCredentialId: null },
    });
    // Deactivate this credential so it stops winning the tenant's own
    // active-credential chain (resolveChannelCredential's tier 2) in later
    // tests — the pin reset above only clears the explicit pointer, not
    // this credential's own eligibility for that chain.
    await prisma.credential.update({
      where: { id: credential.id },
      data: { isActive: false },
    });
  });

  it("falls back to the AppConfig platform default when the number has none", async () => {
    const credential = await prisma.credential.create({
      data: {
        ownerId: owner.id,
        kind: "whatsapp",
        provider: "meta",
        label: "Platform default",
        encryptedKey: encryptSecret("platform-token"),
        keyLast4: "oken",
      },
    });
    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { whatsappCredentialId: credential.id },
      create: { id: "default", whatsappCredentialId: credential.id },
    });

    const token = await resolveWhatsappToken(phoneNumber, owner.id);
    expect(token).toBe("platform-token");
  });

  it("denies an explicit pin credential owned by neither the tenant nor an admin, even when active and provider-matching, with no fallback", async () => {
    const foreignOwner = await createTestUser("wa-resolve-foreign");
    const foreignCredential = await prisma.credential.create({
      data: {
        ownerId: foreignOwner.id,
        kind: "whatsapp",
        provider: "meta",
        label: "Foreign pin",
        encryptedKey: encryptSecret("foreign-token"),
        keyLast4: "oken",
      },
    });
    const pinnedNumber = await prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { whatsappCredentialId: foreignCredential.id },
    });

    // The AppConfig platform default set by the previous test is still a
    // valid, usable credential — proving the denial is not a fallback gap.
    await expect(resolveWhatsappToken(pinnedNumber, owner.id)).rejects.toThrow(
      /No WhatsApp credential/,
    );

    await prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { whatsappCredentialId: null },
    });
    await cleanupOwnershipFixtures([foreignOwner.id]);
  });
});

describe("sendFromNumber", () => {
  let owner: User;
  let phoneNumber: PhoneNumber;

  beforeAll(async () => {
    owner = await createTestUser("wa-send-owner");
    const business = await prisma.business.create({
      data: {
        name: "WA Send Biz",
        systemPrompt: "p",
        welcomeMessage: "w",
        businessInfo: {},
        ownerId: owner.id,
        phoneNumbers: { create: { phoneNumberId: `wa-send-${Date.now()}` } },
      },
      include: { phoneNumbers: true },
    });
    phoneNumber = business.phoneNumbers[0];
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id]);
  });

  beforeEach(() => {
    axiosPostMock.mockReset();
  });

  it("fails closed with zero WhatsApp API calls when no credential can be authorized", async () => {
    await expect(
      sendFromNumber(phoneNumber, owner.id, "5215512345678", "Hola!"),
    ).rejects.toThrow(/No WhatsApp credential/);
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it("sends through the WhatsApp API using the resolved tenant credential's decrypted secret, unchanged message shape", async () => {
    await createTestCredential(owner.id, {
      kind: "whatsapp",
      provider: "meta",
      key: "resolved-send-token",
    });
    axiosPostMock.mockResolvedValue({
      data: { messages: [{ id: "wamid.SENT_001" }] },
    });

    const wamid = await sendFromNumber(
      phoneNumber,
      owner.id,
      "5215512345678",
      "Hola!",
    );

    expect(wamid).toBe("wamid.SENT_001");
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = axiosPostMock.mock.calls[0];
    expect(url).toBe(
      `https://graph.facebook.com/v21.0/${phoneNumber.phoneNumberId}/messages`,
    );
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "5215512345678",
      type: "text",
      text: { body: "Hola!" },
    });
    expect(config).toMatchObject({
      headers: {
        Authorization: "Bearer resolved-send-token",
        "Content-Type": "application/json",
      },
    });
  });

  it("fails closed with zero WhatsApp API calls when the explicit credential pin is owned by neither the tenant nor an admin", async () => {
    const foreignOwner = await createTestUser("wa-send-foreign");
    const foreignCredential = await createTestCredential(foreignOwner.id, {
      kind: "whatsapp",
      provider: "meta",
    });
    const pinnedNumber = await prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { whatsappCredentialId: foreignCredential.id },
    });

    await expect(
      sendFromNumber(pinnedNumber, owner.id, "5215512345678", "Hola!"),
    ).rejects.toThrow(/No WhatsApp credential/);
    expect(axiosPostMock).not.toHaveBeenCalled();

    await prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { whatsappCredentialId: null },
    });
    await cleanupOwnershipFixtures([foreignOwner.id]);
  });
});

describe("sendMessage", () => {
  beforeEach(() => {
    axiosPostMock.mockReset();
  });

  it("throws a ChannelSendError with the classified failure on a Meta error, preserving the original message as a prefix", async () => {
    const axiosError = Object.assign(
      new Error("Request failed with status code 400"),
      {
        response: {
          data: {
            error: {
              code: 131047,
              message: "Re-engagement message",
              error_data: { details: "More than 24 hours have passed" },
            },
          },
        },
      },
    );
    axiosPostMock.mockRejectedValue(axiosError);

    await expect(
      sendMessage("wa-phone-id", "token", "5215512345678", "Hola!"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Request failed with status code 400"),
      failure: { code: "window_expired" },
    });
  });

  it("wraps the thrown error as a ChannelSendError instance", async () => {
    const axiosError = Object.assign(new Error("Request failed"), {
      response: {
        data: { error: { code: 4, message: "Rate limited" } },
      },
    });
    axiosPostMock.mockRejectedValue(axiosError);

    await expect(
      sendMessage("wa-phone-id", "token", "5215512345678", "Hola!"),
    ).rejects.toBeInstanceOf(ChannelSendError);
  });

  it("classifies a network/timeout error with no response body as unknown", async () => {
    axiosPostMock.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(
      sendMessage("wa-phone-id", "token", "5215512345678", "Hola!"),
    ).rejects.toMatchObject({
      failure: { code: "unknown" },
    });
  });
});
