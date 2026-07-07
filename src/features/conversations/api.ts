import type {
  ConversationAppointment,
  ConversationListItem,
  ConversationMessage,
  MessagesPage,
} from "@/features/conversations/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Error");
  }
  return res.json();
}

export function fetchConversations(
  options: { q?: string; businessId?: string; phoneNumberId?: string } = {}
): Promise<ConversationListItem[]> {
  const { q, businessId, phoneNumberId } = options;
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (businessId) params.set("businessId", businessId);
  if (phoneNumberId) params.set("phoneNumberId", phoneNumberId);
  const qs = params.toString();
  return request(`/api/conversations${qs ? `?${qs}` : ""}`);
}

export function fetchMessages(
  conversationId: string,
  cursor?: string | null,
  limit = 50
): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request(`/api/conversations/${conversationId}/messages?${params}`);
}

export function markConversationRead(id: string) {
  return request(`/api/conversations/${id}/read`, { method: "POST" });
}

export function setConversationStatus(id: string, status: string) {
  return request(`/api/conversations/${id}/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function setConversationNickname(id: string, nickname: string) {
  return request(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
}

export function deleteConversation(id: string) {
  return request(`/api/conversations/${id}`, { method: "DELETE" });
}

export function fetchConversationAppointments(
  id: string
): Promise<ConversationAppointment[]> {
  return request(`/api/conversations/${id}/appointments`);
}

export function sendManualMessage(
  id: string,
  text: string
): Promise<ConversationMessage> {
  return request(`/api/conversations/${id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
