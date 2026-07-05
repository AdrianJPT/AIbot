import type { Business } from "@prisma/client";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "./db";
import { generateResponse } from "./ai/generate";
import { callWithFailover } from "./ai/resolve";
import { buildSystemPrompt } from "./prompt";
import {
  describeImageFromBuffer,
  downloadMediaBuffer,
  transcribeAudioBuffer,
} from "./media";
import { sendBusinessMessage } from "./whatsapp";
import { logEvent } from "./log";

const FALLBACK_REPLY =
  "Lo siento, tuve un problema técnico. Intenta de nuevo en un momento.";

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
  const phoneNumberId = metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const business = await prisma.business.findFirst({
    where: { phoneNumberId, isActive: true },
  });
  if (!business) return;

  const statuses = value.statuses as WaStatus[] | undefined;
  if (statuses?.length) {
    for (const status of statuses) {
      await handleStatusUpdate(business.id, status);
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
    await handleOneMessage(business, message, customerName);
  }
}

/**
 * Applies a WhatsApp delivery status update (`sent`/`delivered`/`read`/`failed`)
 * to the outbound Message row matching `wamid`. Unknown statuses (e.g.
 * `deleted`) are ignored. `failed` statuses are logged with their error detail.
 */
async function handleStatusUpdate(
  businessId: string,
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
      businessId
    );
  }
}

async function handleOneMessage(
  business: Business,
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

  const parsed = await parseUserContent(business, message);
  if (!parsed) return;

  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_customerPhone: {
        businessId: business.id,
        customerPhone: from,
      },
    },
    create: {
      businessId: business.id,
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

  let reply: string;
  if (parsed.mediaType === "document") {
    reply =
      "Por ahora no puedo leer archivos o documentos. ¿Puedes escribir tu consulta en un mensaje de texto?";
  } else {
    try {
      const systemPrompt = buildSystemPrompt(business);
      reply = await callWithFailover(business, (client) =>
        generateResponse(client, systemPrompt, history, parsed.content, business.model)
      );
    } catch (err) {
      await logEvent(
        "error",
        "ai",
        "generateResponse failed",
        { error: describeError(err), conversationId: conversation.id },
        business.id
      );
      reply = FALLBACK_REPLY;
    }
  }

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
    const wamid = await sendBusinessMessage(business, from, reply);
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
      business.id
    );
    await prisma.message.update({
      where: { id: outboundMessage.id },
      data: { status: "failed" },
    });
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
  message: WaMessage
): Promise<{ content: string; mediaType: string } | null> {
  const token = business.whatsappToken;

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
      const { buffer, mimeType } = await downloadMediaBuffer(id, token);
      const desc = await describeImageFromBuffer(business, buffer, mimeType);
      return {
        content: `[Imagen del cliente] ${desc}`,
        mediaType: "image",
      };
    }
    case "audio":
    case "voice": {
      const id = message.audio?.id || message.voice?.id;
      if (!id) return null;
      const { buffer } = await downloadMediaBuffer(id, token);
      const text = await transcribeAudioBuffer(business, buffer);
      return { content: `[Audio del cliente] ${text}`, mediaType: "audio" };
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
