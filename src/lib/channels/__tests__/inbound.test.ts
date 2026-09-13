import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { resolveInboundEvent } from "../inbound";
import { whatsappAdapter } from "../whatsapp";

const userIds: string[] = [];

afterEach(async () => {
  await cleanupOwnershipFixtures(userIds.splice(0));
});

function payload(phoneNumberId: string) {
  return {
    entry: [
      {
        changes: [{ value: { metadata: { phone_number_id: phoneNumberId } } }],
      },
    ],
  };
}

async function businessWithPhone(prefix: string) {
  const owner = await createTestUser(prefix);
  userIds.push(owner.id);
  return createTestBusiness(owner.id, prefix);
}

function event(
  overrides: Partial<Parameters<typeof resolveInboundEvent>[0]> = {},
) {
  return {
    id: "event_1",
    rawPayload: null,
    payload: null,
    channel: null,
    provider: null,
    ...overrides,
  };
}

describe("channels/inbound", () => {
  it("decodes verified raw JSON and resolves an active direct connection", async () => {
    const business = await businessWithPhone("direct");
    const phone = business.phoneNumbers[0];
    const connection = await prisma.channelConnection.create({
      data: {
        businessId: business.id,
        channel: "whatsapp",
        provider: "meta",
        externalId: phone.phoneNumberId,
      },
    });

    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: { channelConnectionId: connection.id },
    });

    const result = await resolveInboundEvent(
      event({ rawPayload: JSON.stringify(payload(phone.phoneNumberId)) }),
    );

    expect(result).toMatchObject({
      payload: payload(phone.phoneNumberId),
      raw: expect.any(String),
      connection: {
        id: connection.id,
        businessId: business.id,
        channel: "whatsapp",
        provider: "meta",
      },
    });
  });

  it("decodes a legacy pre-parsed WhatsApp row into bounded tenant context", async () => {
    const business = await businessWithPhone("legacy");
    const phone = business.phoneNumbers[0];

    const result = await resolveInboundEvent(
      event({ payload: payload(phone.phoneNumberId) }),
    );

    expect(result).toMatchObject({
      connection: {
        id: `legacy:${phone.id}`,
        businessId: business.id,
        channel: "whatsapp",
        provider: "meta",
        externalId: phone.phoneNumberId,
        isActive: true,
      },
    });
  });

  it("rejects a mismatched active linked connection for a legacy phone number", async () => {
    const business = await businessWithPhone("linked");
    const phone = business.phoneNumbers[0];
    const connection = await prisma.channelConnection.create({
      data: {
        businessId: business.id,
        channel: "whatsapp",
        provider: "meta",
        externalId: `other-${phone.phoneNumberId}`,
      },
    });
    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: { channelConnectionId: connection.id },
    });

    await expect(
      resolveInboundEvent(event({ payload: payload(phone.phoneNumberId) })),
    ).resolves.toBeNull();
  });

  it.each([
    ["malformed raw payload", event({ rawPayload: "{" })],
    ["unknown channel", event({ channel: "telegram", provider: "meta" })],
    ["mismatched provider", event({ channel: "whatsapp", provider: "other" })],
    ["missing metadata", event({ payload: { entry: [] } })],
  ])("fails closed for %s", async (_reason, inboundEvent) => {
    const normalize = vi.spyOn(whatsappAdapter, "normalize");

    await expect(resolveInboundEvent(inboundEvent)).resolves.toBeNull();
    expect(normalize).not.toHaveBeenCalled();
  });

  it.each([
    ["inactive connection", false, true],
    ["inactive business", true, false],
  ])(
    "rejects a direct connection with %s",
    async (_reason, connectionActive, businessActive) => {
      const business = await businessWithPhone(`direct-${_reason}`);
      const phone = business.phoneNumbers[0];
      if (!businessActive) {
        await prisma.business.update({
          where: { id: business.id },
          data: { isActive: false },
        });
      }
      await prisma.channelConnection.create({
        data: {
          businessId: business.id,
          channel: "whatsapp",
          provider: "meta",
          externalId: phone.phoneNumberId,
          isActive: connectionActive,
        },
      });
      const normalize = vi.spyOn(whatsappAdapter, "normalize");

      await expect(
        resolveInboundEvent(event({ payload: payload(phone.phoneNumberId) })),
      ).resolves.toBeNull();
      expect(normalize).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing or inactive legacy phone number", async () => {
    const business = await businessWithPhone("inactive-phone");
    const phone = business.phoneNumbers[0];
    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: { isActive: false },
    });

    await expect(
      resolveInboundEvent(event({ payload: payload("missing-phone") })),
    ).resolves.toBeNull();
    await expect(
      resolveInboundEvent(event({ payload: payload(phone.phoneNumberId) })),
    ).resolves.toBeNull();
  });

  it("rejects foreign and mismatched linked connections without adapter dispatch", async () => {
    const business = await businessWithPhone("legacy-owner");
    const foreign = await businessWithPhone("legacy-foreign");
    const phone = business.phoneNumbers[0];
    const foreignConnection = await prisma.channelConnection.create({
      data: {
        businessId: foreign.id,
        channel: "whatsapp",
        provider: "meta",
        externalId: `foreign-${phone.phoneNumberId}`,
      },
    });
    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: { channelConnectionId: foreignConnection.id },
    });
    const normalize = vi.spyOn(whatsappAdapter, "normalize");

    await expect(
      resolveInboundEvent(event({ payload: payload(phone.phoneNumberId) })),
    ).resolves.toBeNull();
    expect(normalize).not.toHaveBeenCalled();
  });
});
