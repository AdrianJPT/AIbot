import axios from "axios";
import type { Business, Credential } from "@prisma/client";
import { prisma } from "./db";
import { decryptSecret } from "./crypto";

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
 * Resolves the WhatsApp access token to use for a business. Resolution
 * order: business.whatsappCredentialId -> owner's active whatsapp
 * credential -> legacy Business.whatsappToken column fallback.
 */
export async function resolveWhatsappToken(business: Business): Promise<string> {
  let credential: Credential | null = null;

  if (business.whatsappCredentialId) {
    credential = await prisma.credential.findUnique({
      where: { id: business.whatsappCredentialId },
    });
  }

  if (!credential && business.ownerId) {
    credential = await findActiveWhatsappCredential(business.ownerId);
  }

  if (!credential) {
    return business.whatsappToken;
  }

  await prisma.credential
    .update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return decryptSecret(credential.encryptedKey);
}

/**
 * Sends a WhatsApp message on behalf of a business, resolving the token
 * through the credential system (with legacy fallback) instead of using
 * business.whatsappToken directly.
 */
export async function sendBusinessMessage(
  business: Business,
  to: string,
  text: string
): Promise<string | undefined> {
  const token = await resolveWhatsappToken(business);
  return sendMessage(business.phoneNumberId, token, to, text);
}
