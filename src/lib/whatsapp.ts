import axios from "axios";
import type { PhoneNumber } from "@prisma/client";
import { prisma } from "./db";
import { encryptSecret } from "./crypto";
import type { ChannelConnection } from "./channels/contracts";
import {
  CredentialAuthorizationError,
  resolveChannelCredential,
} from "./channels/credentials";

const API_VERSION = "v21.0";

export async function sendMessage(
  phoneNumberId: string,
  token: string,
  to: string,
  text: string,
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
    },
  );
  return res.data?.messages?.[0]?.id;
}

/**
 * Resolves the WhatsApp access token to use for a phone number, by
 * constructing an in-memory `ChannelConnection` view of `phoneNumber` and
 * delegating to the channel-neutral, fail-closed credential authorization
 * boundary (`resolveChannelCredential`, design's "Routing/credentials"
 * decision — the same boundary inbound media fetching already uses via
 * `channels/media.ts`). Resolution order, enforced by that boundary: an
 * explicit `whatsappCredentialId` pin must be active, provider-compatible,
 * and tenant- or admin-owned, with zero fallback on denial; with no pin,
 * the tenant's own active WhatsApp credential wins; only when the tenant
 * has none does `AppConfig.whatsappCredentialId` (the admin-managed
 * platform default) apply. `ownerId` is the phone number's business's
 * owner id — this is what closes the ownership-check gap the previous
 * implementation only flagged in a comment: an explicit pin belonging to
 * an unrelated tenant is now rejected outright instead of being trusted by
 * id alone. Throws with a "No WhatsApp credential" prefix on any denial,
 * preserving this function's historical error contract.
 */
export async function resolveWhatsappToken(
  phoneNumber: PhoneNumber,
  ownerId: string,
): Promise<string> {
  const connection: ChannelConnection = {
    id: phoneNumber.channelConnectionId ?? phoneNumber.id,
    businessId: phoneNumber.businessId,
    channel: "whatsapp",
    provider: "meta",
    externalId: phoneNumber.phoneNumberId,
    credentialId: phoneNumber.whatsappCredentialId,
    isActive: phoneNumber.isActive,
  };

  try {
    return await resolveChannelCredential(connection, ownerId);
  } catch (err) {
    if (err instanceof CredentialAuthorizationError) {
      throw new Error(
        `No WhatsApp credential configured for phone number ${phoneNumber.id}: ${err.message}`,
      );
    }
    throw err;
  }
}

/**
 * Sends a WhatsApp message from a given phone number, resolving the token
 * through the credential system.
 */
export async function sendFromNumber(
  phoneNumber: PhoneNumber,
  ownerId: string,
  to: string,
  text: string,
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
  rawToken: string,
): Promise<string> {
  const credential = await prisma.credential.create({
    data: {
      ownerId,
      kind: "whatsapp",
      provider: "meta",
      label,
      encryptedKey: encryptSecret(rawToken),
      keyLast4: rawToken.slice(-4),
    },
  });
  return credential.id;
}
