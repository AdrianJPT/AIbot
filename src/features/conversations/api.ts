import type {
  ConversationAppointment,
  ConversationMessage,
  ConversationsPage,
  MessagesPage,
} from "@/features/conversations/types";
import { requestJson } from "@/lib/api-client";

export function fetchConversations(
  options: {
    q?: string;
    businessId?: string;
    phoneNumberId?: string;
    status?: string | null;
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<ConversationsPage> {
  const { q, businessId, phoneNumberId, status, cursor, limit } = options;
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (businessId) params.set("businessId", businessId);
  if (phoneNumberId) params.set("phoneNumberId", phoneNumberId);
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return requestJson(`/api/conversations${qs ? `?${qs}` : ""}`);
}

export function fetchMessages(
  conversationId: string,
  cursor?: string | null,
  limit = 50,
): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return requestJson(`/api/conversations/${conversationId}/messages?${params}`);
}

export function markConversationRead(id: string) {
  return requestJson(`/api/conversations/${id}/read`, { method: "POST" });
}

export function setConversationStatus(id: string, status: string) {
  return requestJson(`/api/conversations/${id}/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function setConversationNickname(id: string, nickname: string) {
  return requestJson(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
}

/**
 * Clears the rolling summary and its watermark. The next flush past the cadence
 * threshold rebuilds one from the raw messages, which is why the button that
 * calls this reads "Regenerar" rather than "Borrar".
 */
export function clearConversationSummary(id: string) {
  return requestJson(`/api/conversations/${id}/summary`, { method: "DELETE" });
}

export function deleteConversation(id: string) {
  return requestJson(`/api/conversations/${id}`, { method: "DELETE" });
}

export function fetchConversationAppointments(
  id: string,
): Promise<ConversationAppointment[]> {
  return requestJson(`/api/conversations/${id}/appointments`);
}

export function sendManualMessage(
  id: string,
  text: string,
): Promise<ConversationMessage> {
  return requestJson(`/api/conversations/${id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
