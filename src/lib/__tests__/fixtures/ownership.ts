import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import type { Business, Credential, User } from "@prisma/client";

export async function createTestUser(prefix: string): Promise<User> {
  const id = randomUUID();
  return prisma.user.create({
    data: { id, email: `${prefix}-${id}@test.local` },
  });
}

export async function createTestBusiness(
  ownerId: string,
  suffix: string
): Promise<Business> {
  return prisma.business.create({
    data: {
      name: `Test Business ${suffix}`,
      phoneNumberId: `test-phone-${suffix}-${randomUUID()}`,
      whatsappToken: "test-token",
      systemPrompt: "test prompt",
      welcomeMessage: "hola",
      businessInfo: {},
      ownerId,
    },
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
    status: string;
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
      status: overrides.status ?? "standby",
    },
  });
}

export async function createTestConversation(businessId: string, suffix: string) {
  return prisma.conversation.create({
    data: {
      businessId,
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
