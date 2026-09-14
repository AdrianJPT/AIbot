import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  createTestBusiness,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

export async function createBusinessWithPhoneNumberId(
  prefix: string,
  phoneNumberId = `backfill-phone-${randomUUID()}`,
) {
  const owner = await createTestUser(`${prefix}-${randomUUID()}`);
  const business = await createTestBusiness(owner.id, prefix);
  const phoneNumber = await prisma.phoneNumber.update({
    where: { id: business.phoneNumbers[0].id },
    data: { phoneNumberId },
  });

  return { owner, business, phoneNumber };
}

export function createForeignChannelConnection(
  businessId: string,
  externalId: string,
) {
  return prisma.channelConnection.create({
    data: {
      businessId,
      channel: "whatsapp",
      provider: "meta",
      externalId,
    },
  });
}
