import type { Business, PhoneNumber } from "@prisma/client";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "./db";
import { generateResponse } from "./ai/generate";
import { callWithAiCredential, resolveModels } from "./ai/resolve";
import { buildSystemPrompt } from "./prompt";
import {
  describeImageFromBuffer,
  downloadMediaBuffer,
  transcribeAudioBuffer,
} from "./media";
import { resolveWhatsappToken, sendFromNumber } from "./whatsapp";
import { logEvent } from "./log";

/**
 * Per-conversation abuse throttle: no Redis, single-replica Railway makes an
 * in-memory limiter viable, but a DB count survives restarts/redeploys.
 * Customer messages beyond the threshold are still persisted (nothing is
 * dropped) — only the AI call (and outbound reply) for the excess is
 * skipped, so a flood can't run up the AI bill or spam the customer back.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MESSAGES = 10;

/**
 * Per-business daily AI-call budget fallback. Hardcoded for now (see
 * docs/plan/06-hardening-extras.md §6.3) — a future pass can make this
 * configurable per business alongside businessInfo/systemPrompt.
 */
const DAILY_LIMIT_MESSAGE =
  "Estamos recibiendo muchos mensajes, en breve te responderemos.";

type WaMessage = {
  from: string;
  id?: string;
  type: string;
  text?: { body: string };
  image?: { id: string };
  audio?: { id: string };
  voice?: { id: string };
  location?: { latitude: number; longitude: number; name?: string };
  document?: { id: string; filename?: string };
  interactive?: {
    type: string;
    list_reply?: { title: string; id?: string };
    button_reply?: { title: string; id?: string };
  };
};

type WaStatus = {
  id: string; // wamid of the outbound message this status refers to
  status: string; // "sent" | "delivered" | "read" | "failed"
  errors?: Array<{ message?: string; title?: string; code?: number }>;
};

/** Statuses this app persists on Message.status; anything else is ignored. */
const KNOWN_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

export async function processWebhookPayload(body: unknown): Promise<void> {
  const entry = (body as { entry?: unknown[] })?.entry?.[0] as
    | { changes?: unknown[] }
    | undefined;
  const change = entry?.changes?.[0] as
    | { value?: Record<string, unknown> }
    | undefined;
  const value = change?.value;
  if (!value) return;

  const metadata = value.metadata as { phone_number_id?: string } | undefined;
  const metaPhoneNumberId = metadata?.phone_number_id;
  if (!metaPhoneNumberId) return;

  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: {
      phoneNumberId: metaPhoneNumberId,
      isActive: true,
      business: { isActive: true },
    },
    include: { business: true },
  });
  if (!phoneNumber) return;

  const { business } = phoneNumber;

  const statuses = value.statuses as WaStatus[] | undefined;
  if (statuses?.length) {
    for (const status of statuses) {
      await handleStatusUpdate(business.id, phoneNumber.id, status);
    }
  }

  const messages = value.messages as WaMessage[] | undefined;
  if (!messages?.length) return;

  const contacts = value.contacts as
    | Array<{ profile?: { name?: string }; wa_id?: string }>
    | undefined;

  for (const message of messages) {
    const customerName = contacts?.find((c) => c.wa_id === message.from)?.profile
      ?.name;
    await handleOneMessage(business, phoneNumber, message, customerName);
  }
}

/**
 * Applies a WhatsApp delivery status update (`sent`/`delivered`/`read`/`failed`)
 * to the outbound Message row matching `wamid`. Unknown statuses (e.g.
 * `deleted`) are ignored. `failed` statuses are logged with their error detail.
 */
async function handleStatusUpdate(
  businessId: string,
  phoneNumberId: string,
  status: WaStatus
): Promise<void> {
  if (!status?.id || !KNOWN_STATUSES.has(status.status)) return;

  const message = await prisma.message.findFirst({
    where: { wamid: status.id },
  });
  if (!message) return;

  await prisma.message.update({
    where: { id: message.id },
    data: { status: status.status },
  });

  if (status.status === "failed") {
    await logEvent(
      "error",
      "whatsapp-send",
      "Message delivery failed",
      { wamid: status.id, errors: status.errors, messageId: message.id },
      businessId,
      phoneNumberId
    );
  }
}

async function handleOneMessage(
  business: Business,
  phoneNumber: PhoneNumber,
  message: WaMessage,
  customerName?: string
): Promise<void> {
  const from = message.from;
  if (!from) return;

  const wamid = message.id;
  if (wamid) {
    const existing = await prisma.message.findFirst({ where: { wamid } });
    if (existing) return;
  }

  const parsed = await parseUserContent(business, phoneNumber, message);
  if (!parsed) return;

  const conversation = await prisma.conversation.upsert({
    where: {
      phoneNumberId_customerPhone: {
        phoneNumberId: phoneNumber.id,
        customerPhone: from,
      },
    },
    create: {
      businessId: business.id,
      phoneNumberId: phoneNumber.id,
      customerPhone: from,
      status: "active",
    },
    update: {},
  });

  if (conversation.status === "handed_off") {
    await persistCustomerMessage(conversation.id, parsed, wamid, customerName);
    return;
  }

  const history = await loadHistory(conversation.id, business.maxHistoryMessages);

  await persistCustomerMessage(conversation.id, parsed, wamid, customerName);

  let reply: string | null = null;

  if (parsed.mediaType === "document") {
    reply =
      "Por ahora no puedo leer archivos o documentos. ¿Puedes escribir tu consulta en un mensaje de texto?";
  } else if (await isRateLimited(conversation.id, business.id)) {
    // Persisted above already — just skip AI generation and the reply.
  } else {
    reply = await resolveAiReply(business, conversation.id, history, parsed.content);
  }

  if (reply === null) return;

  const [outboundMessage] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        mediaType: "text",
        sentBy: "bot",
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  try {
    const wamid = await sendFromNumber(phoneNumber, business.ownerId, from, reply);
    if (wamid) {
      await prisma.message.update({
        where: { id: outboundMessage.id },
        data: { wamid },
      });
    }
  } catch (err) {
    await logEvent(
      "error",
      "whatsapp-send",
      "sendMessage failed",
      { error: describeError(err), conversationId: conversation.id },
      business.id,
      phoneNumber.id
    );
    await prisma.message.update({
      where: { id: outboundMessage.id },
      data: { status: "failed" },
    });
  }
}

/**
 * Per-conversation abuse throttle. Counts customer messages within the last
 * `RATE_LIMIT_WINDOW_MS` (including the one just persisted) — if it exceeds
 * `RATE_LIMIT_MAX_MESSAGES`, the caller should skip AI generation for this
 * message. The message itself is always persisted regardless of this check.
 */
async function isRateLimited(
  conversationId: string,
  businessId: string
): Promise<boolean> {
  const recentCustomerCount = await prisma.message.count({
    where: {
      conversationId,
      sentBy: "customer",
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  });

  if (recentCustomerCount <= RATE_LIMIT_MAX_MESSAGES) return false;

  await logEvent(
    "warn",
    "webhook",
    "Per-conversation rate limit exceeded, skipping AI generation",
    { conversationId, recentCustomerCount },
    businessId
  );
  return true;
}

/**
 * Resolves the bot's reply respecting the per-business daily AI-call budget
 * (`Business.dailyAiLimit`). The budget is counted as bot-authored Message
 * rows created since UTC midnight for the business — simplest option that
 * needs no extra counter column and self-resets daily via `createdAt`.
 *
 * When the budget is exhausted, the canned Spanish notice is sent exactly
 * once per day (checked by looking for a prior bot message with that exact
 * content today) — subsequent messages that day get no reply at all, to
 * avoid spamming the customer.
 */
async function resolveAiReply(
  business: Business,
  conversationId: string,
  history: ChatCompletionMessageParam[],
  content: string
): Promise<string | null> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const aiCallsToday = await prisma.message.count({
    where: {
      sentBy: "bot",
      createdAt: { gte: startOfDay },
      conversation: { businessId: business.id },
    },
  });

  if (aiCallsToday >= business.dailyAiLimit) {
    const alreadyNotifiedToday = await prisma.message.findFirst({
      where: {
        sentBy: "bot",
        content: DAILY_LIMIT_MESSAGE,
        createdAt: { gte: startOfDay },
        conversation: { businessId: business.id },
      },
    });

    if (alreadyNotifiedToday) {
      await logEvent(
        "warn",
        "ai",
        "Daily AI budget exceeded, staying silent (already notified today)",
        { businessId: business.id, aiCallsToday },
        business.id
      );
      return null;
    }

    await logEvent(
      "warn",
      "ai",
      "Daily AI budget exceeded, sending fallback message",
      { businessId: business.id, aiCallsToday },
      business.id
    );
    return DAILY_LIMIT_MESSAGE;
  }

  try {
    const systemPrompt = buildSystemPrompt(business);
    const { chatModel } = await resolveModels(business);
    return await callWithAiCredential(business, (client) =>
      generateResponse(client, systemPrompt, history, content, chatModel)
    );
  } catch (err) {
    await logEvent(
      "error",
      "ai",
      "generateResponse failed",
      { error: describeError(err), conversationId },
      business.id
    );
    return null;
  }
}

/**
 * Persists a customer-originated message and bumps the conversation's
 * denormalized list fields (lastMessageAt, unreadCount, customerName) in a
 * single transaction so the two never drift apart.
 */
async function persistCustomerMessage(
  conversationId: string,
  parsed: { content: string; mediaType: string },
  wamid: string | undefined,
  customerName: string | undefined
): Promise<void> {
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: parsed.content,
        mediaType: parsed.mediaType,
        wamid,
        sentBy: "customer",
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
        ...(customerName && { customerName }),
      },
    }),
  ]);
}

function describeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

async function loadHistory(
  conversationId: string,
  max: number
): Promise<ChatCompletionMessageParam[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: max,
  });
  return rows.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

async function parseUserContent(
  business: Business,
  phoneNumber: PhoneNumber,
  message: WaMessage
): Promise<{ content: string; mediaType: string } | null> {
  switch (message.type) {
    case "text":
      return {
        content: message.text?.body || "",
        mediaType: "text",
      };
    case "interactive": {
      const t =
        message.interactive?.list_reply?.title ||
        message.interactive?.button_reply?.title ||
        "";
      return { content: t || "[Interactivo sin texto]", mediaType: "text" };
    }
    case "image": {
      const id = message.image?.id;
      if (!id) return null;
      try {
        const token = await resolveWhatsappToken(phoneNumber, business.ownerId);
        const { buffer, mimeType } = await downloadMediaBuffer(id, token);
        const desc = await describeImageFromBuffer(business, buffer, mimeType);
        return {
          content: `[Imagen del cliente] ${desc}`,
          mediaType: "image",
        };
      } catch (err) {
        await logEvent(
          "error",
          "ai",
          "describeImageFromBuffer failed",
          { error: describeError(err) },
          business.id,
          phoneNumber.id
        );
        return {
          content: "[Imagen del cliente — no se pudo procesar]",
          mediaType: "image",
        };
      }
    }
    case "audio":
    case "voice": {
      const id = message.audio?.id || message.voice?.id;
      if (!id) return null;
      try {
        const token = await resolveWhatsappToken(phoneNumber, business.ownerId);
        const { buffer } = await downloadMediaBuffer(id, token);
        const text = await transcribeAudioBuffer(business, buffer);
        return { content: `[Audio del cliente] ${text}`, mediaType: "audio" };
      } catch (err) {
        await logEvent(
          "error",
          "ai",
          "transcribeAudioBuffer failed",
          { error: describeError(err) },
          business.id,
          phoneNumber.id
        );
        return {
          content: "[Audio del cliente — no se pudo transcribir]",
          mediaType: "audio",
        };
      }
    }
    case "location": {
      const loc = message.location;
      if (!loc) return null;
      const name = loc.name ? ` (${loc.name})` : "";
      return {
        content: `El cliente envió su ubicación: ${loc.latitude}, ${loc.longitude}${name}`,
        mediaType: "location",
      };
    }
    case "document":
      return { content: "[Documento adjunto]", mediaType: "document" };
    default:
      return null;
  }
}
