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

  it("falls back to the AppConfig platform default when the number and owner have none", async () => {
    const credential = await prisma.credential.create({
      data: {
        ownerId: owner.id,
        kind: "whatsapp",
        provider: "meta",
        label: "Platform default",
        encryptedKey: encryptSecret("platform-token"),
        keyLast4: "oken",
        // Standby on purpose: it must NOT resolve via the owner-active
        // fallback, only via the AppConfig pointer — which requires active,
        // so flip it after wiring AppConfig below.
        status: "standby",
      },
    });
    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { whatsappCredentialId: credential.id },
      create: { id: "default", whatsappCredentialId: credential.id },
    });

    // Still standby -> AppConfig pointer refuses non-active credentials.
    await expect(resolveWhatsappToken(phoneNumber, owner.id)).rejects.toThrow(
      /No WhatsApp credential/
    );

    await prisma.credential.update({
      where: { id: credential.id },
      data: { status: "active" },
    });

    // Owner-active fallback would now also match this credential, so point
    // the lookup at a different owner to prove resolution goes through
    // AppConfig alone.
    const stranger = await createTestUser("wa-resolve-stranger");
    const token = await resolveWhatsappToken(phoneNumber, stranger.id);
    expect(token).toBe("platform-token");
    await cleanupOwnershipFixtures([stranger.id]);
  });
});
