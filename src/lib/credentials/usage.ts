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

/**
 * Checks that every given credential id (ignoring null/undefined entries)
 * belongs to `ownerId`. Used before assigning a credential to a business
 * so an admin can't wire in someone else's credential.
 */
export async function ownsCredentials(
  ownerId: string,
  ids: Array<string | null | undefined>
): Promise<boolean> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) return true;
  const count = await prisma.credential.count({
    where: { id: { in: wanted }, ownerId },
  });
  return count === wanted.length;
}
