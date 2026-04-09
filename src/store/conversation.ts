import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

interface ConversationEntry {
  messages: ChatCompletionMessageParam[];
  lastActivity: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const conversations = new Map<string, ConversationEntry>();

export function getHistory(
  phone: string,
  maxMessages: number
): ChatCompletionMessageParam[] {
  const entry = conversations.get(phone);
  if (!entry) return [];
  return entry.messages.slice(-maxMessages);
}

export function addMessage(
  phone: string,
  role: "user" | "assistant",
  content: string
): void {
  let entry = conversations.get(phone);
  if (!entry) {
    entry = { messages: [], lastActivity: Date.now() };
    conversations.set(phone, entry);
  }
  entry.messages.push({ role, content });
  entry.lastActivity = Date.now();
}

export function cleanExpired(): void {
  const now = Date.now();
  for (const [phone, entry] of conversations) {
    if (now - entry.lastActivity > TTL_MS) {
      conversations.delete(phone);
    }
  }
}

// Clean expired conversations every hour
setInterval(cleanExpired, 60 * 60 * 1000);
