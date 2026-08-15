"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { PaymentInbox } from "@/features/payments/components/payment-inbox";
import { confirmPayment, rejectPayment } from "@/features/payments/api";
import type { PaymentInboxItem } from "@/features/payments/types";

export function PaymentInboxContainer({
  items,
}: {
  items: PaymentInboxItem[];
}) {
  const router = useRouter();

  const confirmMutation = useMutation({
    mutationFn: ({ id, partial }: { id: string; partial: boolean }) =>
      confirmPayment(id, partial),
    onSuccess: () => {
      toast.success("Pago confirmado");
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Error al confirmar"),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectPayment(id),
    onSuccess: () => {
      toast.success("Pago rechazado");
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Error al rechazar"),
  });

  const busyId =
    confirmMutation.isPending || rejectMutation.isPending
      ? (confirmMutation.variables?.id ?? (rejectMutation.variables as string))
      : null;

  return (
    <PaymentInbox
      items={items}
      busyId={busyId}
      onConfirm={(id) => confirmMutation.mutate({ id, partial: false })}
      onConfirmPartial={(id) => {
        if (!confirm("¿Confirmar este pago como parcial?")) return;
        confirmMutation.mutate({ id, partial: true });
      }}
      onReject={(id) => {
        if (!confirm("¿Rechazar este pago?")) return;
        rejectMutation.mutate(id);
      }}
    />
  );
}
