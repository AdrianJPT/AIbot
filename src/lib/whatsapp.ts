import axios from "axios";
import type { Credential, PhoneNumber } from "@prisma/client";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { logEvent } from "./log";

const API_VERSION = "v21.0";

export async function sendMessage(
  phoneNumberId: string,
  token: string,
  to: string,
  text: string
): Promise<string | undefined> {
  const res = await axios.post<{ messages?: Array<{ id?: string }> }>(
    `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return res.data?.messages?.[0]?.id;
}

async function findActiveWhatsappCredential(
  ownerId: string
): Promise<Credential | null> {
  return prisma.credential.findFirst({
    where: { ownerId, kind: "whatsapp", status: "active" },
  });
}

/**
 * Resolves the WhatsApp access token to use for a phone number. Resolution
 * order: phoneNumber.whatsappCredentialId -> owner's active whatsapp
 * credential. The owner-wide fallback is a transition path only (the number
 * should carry its own credential) — every use is warn-logged so it can be
 * retired once production shows zero hits. Throws if neither resolves,
 * since there is no legacy plaintext token to fall back to anymore.
 */
export async function resolveWhatsappToken(
  phoneNumber: PhoneNumber,
  ownerId: string
): Promise<string> {
  let credential: Credential | null = null;

  if (phoneNumber.whatsappCredentialId) {
    credential = await prisma.credential
      .update({
        where: { id: phoneNumber.whatsappCredentialId },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => null);
  }

  if (!credential) {
    const fallback = await findActiveWhatsappCredential(ownerId);
    if (fallback) {
      credential = await prisma.credential.update({
        where: { id: fallback.id },
        data: { lastUsedAt: new Date() },
      });
      await logEvent(
        "warn",
        "whatsapp-send",
        "Resolved WhatsApp token via owner-wide fallback credential, not PhoneNumber.whatsappCredentialId",
        { credentialId: credential.id },
        undefined,
        phoneNumber.id
      );
    }
  }

  if (!credential) {
    throw new Error(
      `No WhatsApp credential configured for phone number ${phoneNumber.id}`
    );
  }

  return decryptSecret(credential.encryptedKey);
}

/**
 * Sends a WhatsApp message from a given phone number, resolving the token
 * through the credential system.
 */
export async function sendFromNumber(
  phoneNumber: PhoneNumber,
  ownerId: string,
  to: string,
  text: string
): Promise<string | undefined> {
  const token = await resolveWhatsappToken(phoneNumber, ownerId);
  return sendMessage(phoneNumber.phoneNumberId, token, to, text);
}

/**
 * Wraps a raw WhatsApp token into a new encrypted Credential. Lets the
 * businesses admin form keep accepting a pasted token directly (instead of
 * always requiring a credential picker) without ever storing it in
 * plaintext. Always creates — never reuses an existing active credential —
 * since a submitted token is a specific value the caller wants stored, not
 * "any active credential this owner happens to already have" (a previous
 * version reused blindly, which silently wired unrelated businesses to the
 * same token).
 */
export async function ensureWhatsappCredential(
  ownerId: string,
  label: string,
  rawToken: string
): Promise<string> {
  const credential = await prisma.credential.create({
    data: {
      ownerId,
      kind: "whatsapp",
      provider: "meta",
      label,
      encryptedKey: encryptSecret(rawToken),
      keyLast4: rawToken.slice(-4),
      status: "active",
    },
  });
  return credential.id;
}
