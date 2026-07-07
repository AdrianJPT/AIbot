import type {
  BusinessInput,
  BusinessOption,
  CredentialOption,
  PhoneNumberInput,
  PhoneNumberItem,
} from "@/features/businesses/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Error al guardar");
  }
  return res.json();
}

export function fetchCredentials(): Promise<CredentialOption[]> {
  return request<CredentialOption[]>("/api/credentials");
}

// Caller-scoped business list (admin: all, client: theirs) — used for the
// conversations list's business filter select.
export function fetchBusinesses(): Promise<BusinessOption[]> {
  return request<BusinessOption[]>("/api/businesses");
}

export function createBusiness(payload: BusinessInput) {
  return request("/api/businesses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateBusiness(id: string, payload: Partial<BusinessInput>) {
  return request(`/api/businesses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchPhoneNumbers(businessId: string): Promise<PhoneNumberItem[]> {
  return request(`/api/businesses/${businessId}/phone-numbers`);
}

export function addPhoneNumber(businessId: string, payload: PhoneNumberInput) {
  return request(`/api/businesses/${businessId}/phone-numbers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
