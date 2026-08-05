import type {
  Credential,
  NewCredentialInput,
  UpdateCredentialInput,
} from "@/features/credentials/types";
import { requestJson } from "@/lib/api-client";

export function fetchCredentials(): Promise<Credential[]> {
  return requestJson<Credential[]>("/api/credentials");
}

export function createCredential(
  payload: NewCredentialInput,
): Promise<Credential> {
  return requestJson<Credential>("/api/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteCredential(id: string) {
  return requestJson(`/api/credentials/${id}`, { method: "DELETE" });
}

export function updateCredential(
  id: string,
  payload: UpdateCredentialInput,
): Promise<Credential> {
  return requestJson<Credential>(`/api/credentials/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function swapCredentialPriority(
  id: string,
  withId: string,
): Promise<unknown> {
  return requestJson(`/api/credentials/${id}/swap-priority`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ withId }),
  });
}
