import { prisma } from "@/lib/db";
import { ensureWhatsappCredential } from "@/lib/whatsapp";

const MAX_REPLY_WINDOW_MS = 300_000;

/**
 * Clamps replyWindowMs to a finite integer in [0, 300_000] (0-300s). The
 * business-form UI enforces this same range client-side (min=0 max=300
 * seconds), but that's not enough on its own — a negative/huge/non-numeric
 * value submitted directly to the API would break the "0 = disabled"
 * contract, so both server-side write paths (this create path and the
 * PATCH route) clamp through this one helper.
 */
export function clampReplyWindowMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_REPLY_WINDOW_MS, Math.trunc(n)));
}

export type CreateBusinessInput = {
  name: string;
  phoneNumberId?: string | null;
  displayPhone?: string | null;
  whatsappToken?: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo?: unknown;
  model?: string | null;
  visionModel?: string | null;
  audioModel?: string | null;
  maxHistoryMessages?: number;
  replyWindowMs?: number;
  isActive?: boolean;
  aiCredentialId?: string | null;
  whatsappCredentialId?: string | null;
};

/**
 * Validates the required fields for creating a business. The first
 * PhoneNumber is optional (numbers can be added later from the business
 * page), and so are WhatsApp/AI credentials — numbers without an explicit
 * credential inherit the platform default at send time (see
 * resolveWhatsappToken). Shared by the standalone businesses route and the
 * combined client-invite flow so both enforce the same rules.
 */
export function validateCreateBusinessInput(
  input: Partial<CreateBusinessInput>
): string | null {
  if (!input.name || !input.systemPrompt || !input.welcomeMessage) {
    return "Faltan campos requeridos del negocio";
  }
  if ((input.whatsappToken || input.whatsappCredentialId) && !input.phoneNumberId) {
    return "Cargaste un token de WhatsApp pero falta el ID técnico del número";
  }
  return null;
}

/**
 * Creates a Business, plus its first PhoneNumber when phoneNumberId is
 * given. A pasted whatsappToken is wrapped into a new encrypted
 * Credential (never stored in plaintext) unless whatsappCredentialId is
 * given directly; with neither, the number inherits the platform default
 * credential at send time. Shared by POST /api/businesses and the admin
 * client-invite flow (see docs/plan/07-waba-phone-numbers.md).
 */
export async function createBusinessForOwner(
  ownerId: string,
  input: CreateBusinessInput
) {
  const resolvedWhatsappCredentialId =
    input.whatsappCredentialId ||
    (input.whatsappToken
      ? await ensureWhatsappCredential(ownerId, `WhatsApp (${input.name})`, input.whatsappToken)
      : null);

  return prisma.business.create({
    data: {
      name: input.name,
      systemPrompt: input.systemPrompt,
      welcomeMessage: input.welcomeMessage,
      businessInfo: input.businessInfo ?? {},
      model: input.model || null,
      visionModel: input.visionModel || null,
      audioModel: input.audioModel || null,
      maxHistoryMessages: input.maxHistoryMessages ?? 20,
      replyWindowMs: clampReplyWindowMs(input.replyWindowMs ?? 0),
      isActive: input.isActive !== false,
      ownerId,
      aiCredentialId: input.aiCredentialId || null,
      ...(input.phoneNumberId && {
        phoneNumbers: {
          create: {
            phoneNumberId: input.phoneNumberId,
            displayPhone: input.displayPhone || null,
            whatsappCredentialId: resolvedWhatsappCredentialId,
          },
        },
      }),
    },
    include: { phoneNumbers: true },
  });
}
