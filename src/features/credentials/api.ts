import type { Credential, NewCredentialInput } from "@/features/credentials/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Error");
  }
  return body as T;
}

export function fetchCredentials(): Promise<Credential[]> {
  return request<Credential[]>("/api/credentials");
}

export function createCredential(payload: NewCredentialInput): Promise<Credential> {
  return request<Credential>("/api/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function activateCredential(id: string) {
  return request(`/api/credentials/${id}/activate`, { method: "POST" });
}

export function revokeCredential(id: string) {
  return request(`/api/credentials/${id}/revoke`, { method: "POST" });
}

export function deleteCredential(id: string) {
  return request(`/api/credentials/${id}`, { method: "DELETE" });
}

export function testCredential(
  id: string,
  payload: { phoneNumberId?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  return request(`/api/credentials/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
