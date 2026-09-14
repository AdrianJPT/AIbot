import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

/**
 * Proves the `ChannelConnection` schema expansion
 * (`openspec/changes/channel-adapter-foundation/design.md`, "Connection
 * identity" decision) actually enforces tenant-safe uniqueness at the
 * database layer, not just in application code, and that the new
 * compatibility columns on `PhoneNumber`/`Conversation` stay optional so
 * existing WhatsApp rows keep working unmigrated (dual-read compatible).
 */
describe("ChannelConnection schema", () => {
  const ownerIds: string[] = [];

  afterAll(async () => {
    await cleanupOwnershipFixtures(ownerIds);
  });

  it("enforces @@unique([provider, externalId]) and rejects a duplicate insert", async () => {
    const owner = await createTestUser("channel-schema-dup");
    ownerIds.push(owner.id);
    const business = await createTestBusiness(owner.id, "channel-schema-dup");
    const externalId = `external-dup-${business.id}`;

    await prisma.channelConnection.create({
      data: {
        businessId: business.id,
        channel: "whatsapp",
        provider: "meta",
        externalId,
      },
    });

    await expect(
      prisma.channelConnection.create({
        data: {
          businessId: business.id,
          channel: "whatsapp",
          provider: "meta",
          externalId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("PhoneNumber.channelConnectionId and Conversation.channelConnectionId/externalParticipantId accept null", async () => {
    const owner = await createTestUser("channel-schema-nullable");
    ownerIds.push(owner.id);
    const business = await createTestBusiness(
      owner.id,
      "channel-schema-nullable",
    );
    const phoneNumber = business.phoneNumbers[0];

    expect(phoneNumber.channelConnectionId).toBeNull();

    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "+5215500000001",
      },
    });

    expect(conversation.channelConnectionId).toBeNull();
    expect(conversation.externalParticipantId).toBeNull();
  });

  it("two ChannelConnection rows with the same provider+externalId for different businesses collide on insert", async () => {
    const ownerA = await createTestUser("channel-schema-cross-a");
    const ownerB = await createTestUser("channel-schema-cross-b");
    ownerIds.push(ownerA.id, ownerB.id);
    const businessA = await createTestBusiness(
      ownerA.id,
      "channel-schema-cross-a",
    );
    const businessB = await createTestBusiness(
      ownerB.id,
      "channel-schema-cross-b",
    );
    const externalId = `external-cross-${businessA.id}`;

    await prisma.channelConnection.create({
      data: {
        businessId: businessA.id,
        channel: "whatsapp",
        provider: "meta",
        externalId,
      },
    });

    await expect(
      prisma.channelConnection.create({
        data: {
          businessId: businessB.id,
          channel: "whatsapp",
          provider: "meta",
          externalId,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const owners = await prisma.channelConnection.findMany({
      where: { provider: "meta", externalId },
    });
    expect(owners).toHaveLength(1);
    expect(owners[0].businessId).toBe(businessA.id);
  });
});
