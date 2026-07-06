import { prisma } from "@/lib/db";
import { ensureWhatsappCredential } from "@/lib/whatsapp";

export type CreateBusinessInput = {
  name: string;
  phoneNumberId: string;
  displayPhone?: string | null;
  whatsappToken?: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo?: unknown;
  model?: string | null;
  visionModel?: string | null;
  audioModel?: string | null;
  maxHistoryMessages?: number;
  isActive?: boolean;
  aiCredentialId?: string | null;
  whatsappCredentialId?: string | null;
};

/**
 * Validates the required fields for creating a business + its first
 * PhoneNumber. Shared by the standalone businesses route and the
 * combined client-invite flow so both enforce the same rules.
 */
export function validateCreateBusinessInput(
  input: Partial<CreateBusinessInput>
): string | null {
  if (!input.name || !input.phoneNumberId || !input.systemPrompt || !input.welcomeMessage) {
    return "Faltan campos requeridos del negocio";
  }
  if (!input.whatsappToken && !input.whatsappCredentialId) {
    return "Asigná una credencial de WhatsApp o cargá un token";
  }
  return null;
}

/**
 * Creates a Business + its first PhoneNumber for an already-existing
 * owner. A pasted whatsappToken is wrapped into a new encrypted
 * Credential (never stored in plaintext) unless whatsappCredentialId is
 * given directly. Shared by POST /api/businesses and the admin
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
      isActive: input.isActive !== false,
      ownerId,
      aiCredentialId: input.aiCredentialId || null,
      phoneNumbers: {
        create: {
          phoneNumberId: input.phoneNumberId,
          displayPhone: input.displayPhone || null,
          whatsappCredentialId: resolvedWhatsappCredentialId,
        },
      },
    },
    include: { phoneNumbers: true },
  });
}
