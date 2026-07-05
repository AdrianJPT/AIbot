import OpenAI from "openai";
import axios from "axios";
import type { Credential } from "@prisma/client";
import { decryptSecret } from "../crypto";

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
};

const PROVIDER_TEST_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  google: "gemini-1.5-flash",
};

const WHATSAPP_API_VERSION = "v21.0";

export type CredentialTestResult = { ok: boolean; error?: string };

/**
 * Makes a real, cheap (1-token) completion call against the AI provider
 * to verify the key is valid. Does not throw — failures are reported via
 * the returned result so route handlers can persist lastError/lastUsedAt.
 */
export async function testAiCredential(
  credential: Credential
): Promise<CredentialTestResult> {
  try {
    const apiKey = decryptSecret(credential.encryptedKey);
    const baseURL = credential.baseUrl || PROVIDER_BASE_URLS[credential.provider];
    const client = new OpenAI({ apiKey, baseURL });

    await client.chat.completions.create({
      model: PROVIDER_TEST_MODELS[credential.provider] || "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Verifies a WhatsApp access token via `GET /v21.0/{phone_number_id}`.
 * A Credential of kind "whatsapp" is not necessarily tied to a single
 * business (it can be assigned to several, or none yet), so the phone
 * number id to test against must be supplied by the caller — the admin
 * UI passes the phoneNumberId of whichever business the admin wants to
 * verify the token against (or any phone number id owned by the same
 * WhatsApp Business Account).
 */
export async function testWhatsappCredential(
  credential: Credential,
  phoneNumberId?: string
): Promise<CredentialTestResult> {
  if (!phoneNumberId) {
    return {
      ok: false,
      error: "phoneNumberId es requerido para probar una credencial de WhatsApp",
    };
  }

  try {
    const token = decryptSecret(credential.encryptedKey);
    await axios.get(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const apiMessage = err.response?.data?.error?.message;
    return apiMessage || err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
