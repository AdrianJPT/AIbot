import type { BusinessInput } from "@/features/businesses/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Error");
  }
  return body as T;
}

export function inviteClient(payload: {
  email: string;
  name?: string;
  business: Omit<BusinessInput, "ownerId">;
}) {
  return request("/api/admin/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
