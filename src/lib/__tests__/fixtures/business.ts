import type { Business } from "@prisma/client";
import { TEST_PHONE_NUMBER_ID } from "./webhook-payload";

/**
 * In-memory `Business` row for the message-handler tests, which mock Prisma
 * instead of hitting Postgres. Every column the model declares is listed
 * explicitly, so adding one to the schema surfaces as a single type error
 * here rather than one per test file.
 */
export function buildBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz_1",
    name: "Test Business",
    phoneNumberId: TEST_PHONE_NUMBER_ID,
    displayPhone: null,
    whatsappToken: "test-token",
    systemPrompt: "You are a helpful assistant for {businessName}.",
    welcomeMessage: "Welcome to {businessName}",
    businessInfo: {},
    model: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
    maxHistoryMessages: 20,
    dailyAiLimit: 1000,
    isActive: true,
    ownerId: null,
    aiCredentialId: null,
    whatsappCredentialId: null,
    createdAt: new Date(),
    ...overrides,
  };
}
