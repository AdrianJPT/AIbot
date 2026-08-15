"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PaymentCard } from "@/features/payments/components/payment-card";
import {
  confirmPayment,
  fetchPaymentDetail,
  rejectPayment,
} from "@/features/payments/api";
import { paymentKeys } from "@/features/payments/query-keys";

/**
 * Fetches one PaymentSession's full detail and wires confirm/reject to the
 * exact same `/api/payments/[id]/confirm` and `/reject` endpoints the
 * dashboard container uses (src/features/payments/containers/
 * payment-inbox-container.tsx) — same `confirmPayment`/`rejectPayment`
 * functions, same request shape, so confirming from here produces the same
 * state transition, audit entries, and customer notification as confirming
 * from the dashboard (spec's "Confirm from chat card (phase 2)" scenario).
 * Used by both the inline chat card and the dashboard's detail sheet
 * (tasks #568 PR4).
 */
export function PaymentCardContainer({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: paymentKeys.detail(sessionId),
    queryFn: () => fetchPaymentDetail(sessionId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: paymentKeys.detail(sessionId) });
    // The dashboard inbox list (GET /api/payments) is a separate query the
    // server component seeds on load — invalidating the broader payments key
    // keeps any co-mounted inbox in sync after a chat-card action.
    queryClient.invalidateQueries({ queryKey: paymentKeys.all });
  }

  const confirmMutation = useMutation({
    mutationFn: (partial: boolean) => confirmPayment(sessionId, partial),
    onSuccess: () => {
      toast.success("Pago confirmado");
      invalidate();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Error al confirmar"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectPayment(sessionId),
    onSuccess: () => {
      toast.success("Pago rechazado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Error al rechazar"),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        Cargando pago…
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-destructive">
        No se pudo cargar el pago.
      </div>
    );
  }

  return (
    <PaymentCard
      detail={detail}
      busy={confirmMutation.isPending || rejectMutation.isPending}
      onConfirm={() => confirmMutation.mutate(false)}
      onConfirmPartial={() => {
        if (!confirm("¿Confirmar este pago como parcial?")) return;
        confirmMutation.mutate(true);
      }}
      onReject={() => {
        if (!confirm("¿Rechazar este pago?")) return;
        rejectMutation.mutate();
      }}
    />
  );
}
