import type { Business } from "@prisma/client";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "./db";
import { generateResponse } from "./openai";
import { buildSystemPrompt } from "./prompt";
import {
  describeImageFromBuffer,
  downloadMediaBuffer,
  transcribeAudioBuffer,
} from "./media";
import { sendMessage } from "./whatsapp";

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

  const messages = value.messages as WaMessage[] | undefined;
  if (!messages?.length) return;

  for (const message of messages) {
    await handleOneMessage(business, message);
  }
}

async function handleOneMessage(
  business: Business,
  message: WaMessage
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
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: parsed.content,
        mediaType: parsed.mediaType,
        wamid,
      },
    });
    return;
  }

  const history = await loadHistory(conversation.id, business.maxHistoryMessages);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: parsed.content,
      mediaType: parsed.mediaType,
      wamid,
    },
  });

  let reply: string;
  if (parsed.mediaType === "document") {
    reply =
      "Por ahora no puedo leer archivos o documentos. ¿Puedes escribir tu consulta en un mensaje de texto?";
  } else {
    const systemPrompt = buildSystemPrompt(business);
    reply = await generateResponse(
      systemPrompt,
      history,
      parsed.content,
      business.model
    );
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: reply,
      mediaType: "text",
    },
  });

  await sendMessage(
    business.phoneNumberId,
    business.whatsappToken,
    from,
    reply
  );
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
      const desc = await describeImageFromBuffer(buffer, mimeType);
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
      const text = await transcribeAudioBuffer(buffer);
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
