import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PhoneNumber, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { resolveWhatsappToken } from "@/lib/whatsapp";
import { cleanupOwnershipFixtures, createTestUser } from "@/lib/__tests__/fixtures/ownership";

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
      /No WhatsApp credential/
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
});
