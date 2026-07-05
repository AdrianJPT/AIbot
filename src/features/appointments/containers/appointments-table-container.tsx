"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";
import {
  deleteAppointment,
  updateAppointmentStatus,
} from "@/features/appointments/api";
import type { AppointmentListItem } from "@/features/appointments/types";

export function AppointmentsTableContainer({
  appointments,
}: {
  appointments: AppointmentListItem[];
}) {
  const router = useRouter();

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateAppointmentStatus(id, status),
    onSuccess: () => {
      toast.success("Cita actualizada");
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al actualizar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => {
      toast.success("Cita eliminada");
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al eliminar"),
  });

  const busyId =
    statusMutation.isPending || deleteMutation.isPending
      ? (statusMutation.variables?.id ?? (deleteMutation.variables as string))
      : null;

  return (
    <AppointmentTable
      appointments={appointments}
      busyId={busyId}
      onConfirm={(id) => statusMutation.mutate({ id, status: "confirmed" })}
      onCancel={(id) => statusMutation.mutate({ id, status: "cancelled" })}
      onDelete={(id) => {
        if (!confirm("¿Eliminar cita?")) return;
        deleteMutation.mutate(id);
      }}
    />
  );
}
