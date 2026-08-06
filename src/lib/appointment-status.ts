export const APPOINTMENT_STATUSES = ["pending", "confirmed", "cancelled"] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function isAppointmentStatus(v: unknown): v is AppointmentStatus {
  return (
    typeof v === "string" &&
    (APPOINTMENT_STATUSES as readonly string[]).includes(v)
  );
}
