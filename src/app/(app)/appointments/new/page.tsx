import Link from "next/link";
import { NewAppointmentFormContainer } from "@/features/appointments/containers/new-appointment-form-container";

export default function NewAppointmentPage() {
  return (
    <div>
      <Link
        href="/appointments"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Citas
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Nueva cita</h1>
      <NewAppointmentFormContainer />
    </div>
  );
}
