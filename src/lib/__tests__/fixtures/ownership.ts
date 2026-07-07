import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import type { Business, Credential, PhoneNumber, User } from "@prisma/client";

export async function createTestUser(
  prefix: string,
  role: "admin" | "client" = "client"
): Promise<User> {
  const id = randomUUID();
  return prisma.user.create({
    data: { id, email: `${prefix}-${id}@test.local`, role },
  });
}

export async function createTestBusiness(
  ownerId: string,
  suffix: string
): Promise<Business & { phoneNumbers: PhoneNumber[] }> {
  return prisma.business.create({
    data: {
      name: `Test Business ${suffix}`,
      systemPrompt: "test prompt",
      welcomeMessage: "hola",
      businessInfo: {},
      ownerId,
      phoneNumbers: {
        create: { phoneNumberId: `test-phone-${suffix}-${randomUUID()}` },
      },
    },
    include: { phoneNumbers: true },
  });
}

export async function createTestCredential(
  ownerId: string,
  overrides: Partial<{
    kind: string;
    provider: string;
    label: string;
    key: string;
    baseUrl: string | null;
    isActive: boolean;
    priority: number;
  }> = {}
): Promise<Credential> {
  const key = overrides.key ?? `sk-test-${randomUUID()}`;
  return prisma.credential.create({
    data: {
      ownerId,
      kind: overrides.kind ?? "ai",
      provider: overrides.provider ?? "openai",
      label: overrides.label ?? "Test credential",
      encryptedKey: encryptSecret(key),
      keyLast4: key.slice(-4),
      baseUrl: overrides.baseUrl ?? null,
      ...(overrides.isActive !== undefined && { isActive: overrides.isActive }),
      ...(overrides.priority !== undefined && { priority: overrides.priority }),
    },
  });
}

export async function createTestConversation(businessId: string, suffix: string) {
  const phoneNumber = await prisma.phoneNumber.findFirstOrThrow({
    where: { businessId },
  });
  return prisma.conversation.create({
    data: {
      businessId,
      phoneNumberId: phoneNumber.id,
      customerPhone: `+549${suffix}`,
    },
  });
}

/**
 * Deletes businesses (cascades conversations/messages/appointments) then
 * the users that own them. Call in afterAll/afterEach to keep the shared
 * local Postgres clean between test runs.
 */
export async function cleanupOwnershipFixtures(userIds: string[]): Promise<void> {
  await prisma.business.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.credential.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
