import type { Business, PhoneNumber, WebhookEvent } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TEST_PHONE_NUMBER_ID } from "./webhook-payload";

/**
 * In-memory `Business` row for the handler tests, which mock Prisma rather
 * than hitting Postgres. Every column the model declares is listed
 * explicitly, so adding one to the schema surfaces as a single type error
 * here instead of one per test file.
 */
export function buildBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz_1",
    name: "Test Business",
    wabaId: null,
    systemPrompt: "You are a helpful assistant for {businessName}.",
    welcomeMessage: "Welcome to {businessName}",
    businessInfo: {},
    knowledgeDoc: null,
    model: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
    maxHistoryMessages: 20,
    replyWindowMs: 0,
    dailyAiLimit: 1000,
    isActive: true,
    ownerId: "owner_1",
    aiCredentialId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Matching in-memory `PhoneNumber` row. Defaults to belonging to the
 * business `buildBusiness()` returns and to the phone number id the webhook
 * payload fixtures send, so the two line up without the caller wiring them.
 */
export function buildPhoneNumber(
  overrides: Partial<PhoneNumber> = {},
): PhoneNumber {
  return {
    id: "phone_1",
    businessId: "biz_1",
    phoneNumberId: TEST_PHONE_NUMBER_ID,
    displayPhone: null,
    whatsappCredentialId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Real-DB `WebhookEvent` row for `src/lib/outbox/repository.ts` tests.
 * Every field is overridable — lease-expiry and claim-ordering tests need to
 * write `nextRunAt`/`leaseExpiresAt`/`attempts`/`status` directly rather than
 * only through `enqueue`/`claimBatch`.
 */
export async function createTestWebhookEvent(
  overrides: Partial<{
    payload: Prisma.InputJsonValue;
    status: WebhookEvent["status"];
    attempts: number;
    maxAttempts: number;
    nextRunAt: Date;
    leaseExpiresAt: Date | null;
    lockedBy: string | null;
    lastError: string | null;
  }> = {},
): Promise<WebhookEvent> {
  return prisma.webhookEvent.create({
    data: {
      payload: overrides.payload ?? { test: true },
      ...(overrides.status !== undefined && { status: overrides.status }),
      ...(overrides.attempts !== undefined && { attempts: overrides.attempts }),
      ...(overrides.maxAttempts !== undefined && {
        maxAttempts: overrides.maxAttempts,
      }),
      ...(overrides.nextRunAt !== undefined && {
        nextRunAt: overrides.nextRunAt,
      }),
      ...(overrides.leaseExpiresAt !== undefined && {
        leaseExpiresAt: overrides.leaseExpiresAt,
      }),
      ...(overrides.lockedBy !== undefined && { lockedBy: overrides.lockedBy }),
      ...(overrides.lastError !== undefined && {
        lastError: overrides.lastError,
      }),
    },
  });
}

/**
 * `WebhookEvent` has no FK to `Business`/`User`, so
 * `cleanupOwnershipFixtures` (`ownership.ts:84-90`) does not cascade to it —
 * tests that create rows via `createTestWebhookEvent` must clean up here.
 */
export async function cleanupWebhookEvents(ids: string[]): Promise<void> {
  await prisma.webhookEvent.deleteMany({ where: { id: { in: ids } } });
}
