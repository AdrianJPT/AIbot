import type {
  Credential,
  NewCredentialInput,
  UpdateCredentialInput,
} from "@/features/credentials/types";

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

export function deleteCredential(id: string) {
  return request(`/api/credentials/${id}`, { method: "DELETE" });
}

export function updateCredential(
  id: string,
  payload: UpdateCredentialInput
): Promise<Credential> {
  return request<Credential>(`/api/credentials/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
