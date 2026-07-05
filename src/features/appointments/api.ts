import type {
  AppointmentInput,
  BusinessOption,
} from "@/features/appointments/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Error");
  }
  return res.json();
}

export function fetchBusinessOptions(): Promise<BusinessOption[]> {
  return request<BusinessOption[]>("/api/businesses");
}

export function createAppointment(payload: AppointmentInput) {
  return request("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateAppointmentStatus(id: string, status: string) {
  return request(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function deleteAppointment(id: string) {
  return request(`/api/appointments/${id}`, { method: "DELETE" });
}
