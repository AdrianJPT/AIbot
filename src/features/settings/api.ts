import type { AiDefaults } from "@/features/settings/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Error");
  }
  return body as T;
}

export function fetchAiDefaults(): Promise<AiDefaults> {
  return request<AiDefaults>("/api/settings/ai-defaults");
}

export function updateAiDefaults(payload: AiDefaults): Promise<AiDefaults> {
  return request<AiDefaults>("/api/settings/ai-defaults", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
