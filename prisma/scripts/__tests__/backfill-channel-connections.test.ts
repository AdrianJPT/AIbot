import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupOwnershipFixtures } from "@/lib/__tests__/fixtures/ownership";
import { backfillChannelConnections } from "../backfill-channel-connections";
import {
  createBusinessWithPhoneNumberId,
  createForeignChannelConnection,
} from "./fixtures/channel-connection-backfill";

describe("backfillChannelConnections", () => {
  const ownerIds: string[] = [];

  afterEach(async () => {
    await cleanupOwnershipFixtures(ownerIds.splice(0));
  });

  it("maps each PhoneNumber to one ChannelConnection preserving business ownership", async () => {
    const first = await createBusinessWithPhoneNumberId("backfill-first");
    const second = await createBusinessWithPhoneNumberId("backfill-second");
    ownerIds.push(first.owner.id, second.owner.id);

    const result = await backfillChannelConnections(prisma);
    expect(result).toEqual({ created: 2, skipped: 0, collisions: [] });

    const connections = await prisma.channelConnection.findMany({
      where: { businessId: { in: [first.business.id, second.business.id] } },
      orderBy: { businessId: "asc" },
    });
    expect(connections).toHaveLength(2);
    expect(connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessId: first.business.id,
          channel: "whatsapp",
          provider: "meta",
          externalId: first.phoneNumber.phoneNumberId,
        }),
        expect.objectContaining({
          businessId: second.business.id,
          channel: "whatsapp",
          provider: "meta",
          externalId: second.phoneNumber.phoneNumberId,
        }),
      ]),
    );
    const mappedPhoneNumbers = await prisma.phoneNumber.findMany({
      where: { id: { in: [first.phoneNumber.id, second.phoneNumber.id] } },
      select: {
        businessId: true,
        channelConnectionId: true,
        phoneNumberId: true,
      },
    });
    expect(mappedPhoneNumbers).toEqual(
      expect.arrayContaining(
        connections.map((connection) =>
          expect.objectContaining({
            businessId: connection.businessId,
            channelConnectionId: connection.id,
            phoneNumberId: connection.externalId,
          }),
        ),
      ),
    );
  });

  it("is idempotent when run twice", async () => {
    const fixture = await createBusinessWithPhoneNumberId("backfill-repeat");
    ownerIds.push(fixture.owner.id);

    await expect(backfillChannelConnections(prisma)).resolves.toMatchObject({
      created: 1,
      skipped: 0,
      collisions: [],
    });
    await expect(backfillChannelConnections(prisma)).resolves.toEqual({
      created: 0,
      skipped: 1,
      collisions: [],
    });
    await expect(
      prisma.channelConnection.count({
        where: { businessId: fixture.business.id },
      }),
    ).resolves.toBe(1);
  });

  it("reports cross-business provider identity collisions without partial writes", async () => {
    const owner = await createBusinessWithPhoneNumberId("backfill-owner");
    const foreign = await createBusinessWithPhoneNumberId("backfill-foreign");
    ownerIds.push(owner.owner.id, foreign.owner.id);
    await createForeignChannelConnection(
      foreign.business.id,
      owner.phoneNumber.phoneNumberId,
    );

    await expect(backfillChannelConnections(prisma)).resolves.toEqual({
      created: 0,
      skipped: 0,
      collisions: [
        {
          businessId: owner.business.id,
          externalId: owner.phoneNumber.phoneNumberId,
          reason: "identity_owned_by_other_business",
        },
      ],
    });
    await expect(
      prisma.channelConnection.count({
        where: { businessId: owner.business.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.channelConnection.count({
        where: { businessId: foreign.business.id },
      }),
    ).resolves.toBe(1);
  });

  it("aborts the whole transaction when any row is invalid", async () => {
    const valid = await createBusinessWithPhoneNumberId("backfill-valid");
    const invalid = await createBusinessWithPhoneNumberId(
      "backfill-invalid",
      "",
    );
    ownerIds.push(valid.owner.id, invalid.owner.id);

    await expect(backfillChannelConnections(prisma)).resolves.toEqual({
      created: 0,
      skipped: 0,
      collisions: [
        {
          businessId: invalid.business.id,
          externalId: "",
          reason: "invalid_external_id",
        },
      ],
    });
    await expect(
      prisma.channelConnection.count({
        where: { businessId: { in: [valid.business.id, invalid.business.id] } },
      }),
    ).resolves.toBe(0);
  });
});
