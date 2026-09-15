import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestMessage,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { isNewBillableChat } from "../billable-chat";

const ownerIds: string[] = [];

afterEach(async () => {
  await cleanupOwnershipFixtures(ownerIds.splice(0));
});

async function setupConversation(prefix: string) {
  const owner = await createTestUser(prefix);
  ownerIds.push(owner.id);
  const business = await createTestBusiness(owner.id, prefix);
  return createTestConversation(business.id, prefix);
}

describe("isNewBillableChat", () => {
  it("returns true when no customer message exists at all", async () => {
    const conversation = await setupConversation("nbc-empty");

    const result = await isNewBillableChat(conversation.id, new Date());

    expect(result).toBe(true);
  });

  it("returns false when a customer message landed 23h before", async () => {
    const conversation = await setupConversation("nbc-23h");
    const at = new Date();
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: new Date(at.getTime() - 23 * 60 * 60 * 1000),
    });

    const result = await isNewBillableChat(conversation.id, at);

    expect(result).toBe(false);
  });

  it("returns true when the last customer message landed 25h before", async () => {
    const conversation = await setupConversation("nbc-25h");
    const at = new Date();
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: new Date(at.getTime() - 25 * 60 * 60 * 1000),
    });

    const result = await isNewBillableChat(conversation.id, at);

    expect(result).toBe(true);
  });

  it("ignores a bot reply inside the last 24h — only customer messages reset the clock", async () => {
    const conversation = await setupConversation("nbc-bot");
    const at = new Date();
    await createTestMessage(conversation.id, {
      sentBy: "bot",
      createdAt: new Date(at.getTime() - 60 * 60 * 1000), // 1h before, but not a customer message
    });

    const result = await isNewBillableChat(conversation.id, at);

    expect(result).toBe(true);
  });
});
