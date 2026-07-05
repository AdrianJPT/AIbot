"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { NewAppointmentForm } from "@/features/appointments/components/new-appointment-form";
import {
  createAppointment,
  fetchBusinessOptions,
} from "@/features/appointments/api";
import type { AppointmentInput } from "@/features/appointments/types";

export function NewAppointmentFormContainer() {
  const router = useRouter();

  const { data: businesses = [] } = useQuery({
    queryKey: ["businesses", "options"],
    queryFn: fetchBusinessOptions,
  });

  const mutation = useMutation({
    mutationFn: (payload: AppointmentInput) => createAppointment(payload),
    onSuccess: () => {
      toast.success("Cita creada");
      router.push("/appointments");
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al crear la cita"),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      businessId: fd.get("businessId") as string,
      customerPhone: fd.get("customerPhone") as string,
      customerName: fd.get("customerName") as string,
      service: fd.get("service") as string,
      date: fd.get("date") as string,
      time: fd.get("time") as string,
      notes: (fd.get("notes") as string) || null,
    });
  }

  return (
    <NewAppointmentForm
      businesses={businesses}
      submitting={mutation.isPending}
      onSubmit={onSubmit}
    />
  );
}
