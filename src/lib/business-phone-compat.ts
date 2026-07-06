import type { PhoneNumber } from "@prisma/client";

/**
 * Flattens a Business's first (today: only) PhoneNumber onto the object so
 * every reader of a Business — API responses, server-rendered pages — can
 * keep referencing the flat phoneNumberId/displayPhone/whatsappCredentialId
 * shape from before PhoneNumber existed (see
 * docs/plan/07-waba-phone-numbers.md). Real per-number UI is a follow-up.
 */
export function flattenBusinessPhoneNumber<
  T extends { phoneNumbers: PhoneNumber[] },
>(business: T): Omit<T, "phoneNumbers"> & {
  phoneNumberId: string | null;
  displayPhone: string | null;
  whatsappCredentialId: string | null;
} {
  const { phoneNumbers, ...rest } = business;
  const phoneNumber = phoneNumbers[0];
  return {
    ...rest,
    phoneNumberId: phoneNumber?.phoneNumberId ?? null,
    displayPhone: phoneNumber?.displayPhone ?? null,
    whatsappCredentialId: phoneNumber?.whatsappCredentialId ?? null,
  };
}
