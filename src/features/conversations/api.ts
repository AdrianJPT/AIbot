import type {
  ConversationListItem,
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

export function fetchConversations(): Promise<ConversationListItem[]> {
  return request("/api/conversations");
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

export function sendManualMessage(id: string, text: string) {
  return request(`/api/conversations/${id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
