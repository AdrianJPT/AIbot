"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClientBusinessesTable } from "@/features/admin/components/client-businesses-table";
import { updateBusiness } from "@/features/businesses/api";
import type { ClientBusinessItem } from "@/features/admin/types";

export function ClientBusinessesTableContainer({
  businesses,
}: {
  businesses: ClientBusinessItem[];
}) {
  const router = useRouter();

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateBusiness(id, { isActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? "Número reactivado" : "Número desactivado");
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al actualizar"),
  });

  return (
    <ClientBusinessesTable
      businesses={businesses}
      busyId={toggleMutation.isPending ? toggleMutation.variables?.id : null}
      onToggleActive={(id, nextIsActive) => {
        if (
          !nextIsActive &&
          !confirm("¿Desactivar este número? Deja de recibir/enviar mensajes.")
        ) {
          return;
        }
        toggleMutation.mutate({ id, isActive: nextIsActive });
      }}
    />
  );
}
