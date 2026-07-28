import type { Business, PhoneNumber } from "@prisma/client";
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
