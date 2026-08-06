import type {
  AppointmentInput,
  BusinessOption,
} from "@/features/appointments/types";
import { requestJson } from "@/lib/api-client";

export function fetchBusinessOptions(): Promise<BusinessOption[]> {
  return requestJson<BusinessOption[]>("/api/businesses");
}

export function createAppointment(payload: AppointmentInput) {
  return requestJson("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateAppointmentStatus(id: string, status: string) {
  return requestJson(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function deleteAppointment(id: string) {
  return requestJson(`/api/appointments/${id}`, { method: "DELETE" });
}
