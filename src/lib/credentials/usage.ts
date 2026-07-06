import { prisma } from "@/lib/db";

/**
 * Returns the name of a Business currently referencing this credential
 * (via Business.aiCredentialId or PhoneNumber.whatsappCredentialId), or
 * null if none does. Used to block revoking/deleting a credential still
 * in use.
 */
export async function findCredentialUsageBusinessName(
  credentialId: string
): Promise<string | null> {
  const business = await prisma.business.findFirst({
    where: { aiCredentialId: credentialId },
  });
  if (business) return business.name;

  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: { whatsappCredentialId: credentialId },
    include: { business: true },
  });
  return phoneNumber?.business.name ?? null;
}
