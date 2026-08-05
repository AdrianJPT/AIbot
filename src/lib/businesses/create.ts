import { prisma } from "@/lib/db";
import { ensureWhatsappCredential } from "@/lib/whatsapp";
import { truncateChars } from "@/lib/prompt";
import {
  clampReplyWindowMs,
  DEFAULT_REPLY_WINDOW_MS,
} from "@/lib/businesses/reply-window";

export { clampReplyWindowMs } from "@/lib/businesses/reply-window";

/**
 * Upper bound on the knowledge document, in characters — roughly 5k tokens.
 *
 * Characters rather than lines: one line can hold five words or five hundred, so
 * a line count tells you nothing about what a call will cost. The document is
 * admin-authored and therefore trusted, so this is not a security bound; it stops
 * a pasted 300-page PDF from being billed on every single message.
 */
export const MAX_KNOWLEDGE_DOC_CHARS = 20_000;

/**
 * Normalizes a knowledge document to `string | null`.
 *
 * Whitespace-only input becomes null rather than an empty document, so clearing
 * the textarea in the admin form genuinely turns the feature off instead of
 * prepending an empty header block. Truncation here is a backstop: the form's
 * `maxLength` shows the admin the limit before they hit it, in the same
 * belt-and-braces arrangement as `replyWindowSeconds`'s min/max plus
 * `clampReplyWindowMs`. Both server-side write paths go through this one helper.
 */
export function normalizeKnowledgeDoc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // truncateChars, not slice: the cap must not split a surrogate pair, or the
  // stored document carries invalid UTF-16 that buildSystemPrompt forwards
  // verbatim to the provider.
  return truncateChars(trimmed, MAX_KNOWLEDGE_DOC_CHARS);
}

export type CreateBusinessInput = {
  name: string;
  phoneNumberId?: string | null;
  displayPhone?: string | null;
  whatsappToken?: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo?: unknown;
  knowledgeDoc?: string | null;
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
  input: Partial<CreateBusinessInput>,
): string | null {
  if (!input.name || !input.systemPrompt || !input.welcomeMessage) {
    return "Faltan campos requeridos del negocio";
  }
  if (
    (input.whatsappToken || input.whatsappCredentialId) &&
    !input.phoneNumberId
  ) {
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
  input: CreateBusinessInput,
) {
  const resolvedWhatsappCredentialId =
    input.whatsappCredentialId ||
    (input.whatsappToken
      ? await ensureWhatsappCredential(
          ownerId,
          `WhatsApp (${input.name})`,
          input.whatsappToken,
        )
      : null);

  return prisma.business.create({
    data: {
      name: input.name,
      systemPrompt: input.systemPrompt,
      welcomeMessage: input.welcomeMessage,
      businessInfo: input.businessInfo ?? {},
      knowledgeDoc: normalizeKnowledgeDoc(input.knowledgeDoc),
      model: input.model || null,
      visionModel: input.visionModel || null,
      audioModel: input.audioModel || null,
      maxHistoryMessages: input.maxHistoryMessages ?? 20,
      replyWindowMs: clampReplyWindowMs(
        input.replyWindowMs ?? DEFAULT_REPLY_WINDOW_MS,
      ),
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
