import { requestJson } from "@/lib/api-client";
import type { PaymentDetail } from "@/features/payments/types";

/**
 * Payment session detail (session + every proof + full audit trail) — used
 * by both the dashboard's detail sheet and the inline chat card (tasks #568
 * PR4). Same GET /api/payments/[id] endpoint slice 3 built.
 */
export function fetchPaymentDetail(id: string): Promise<PaymentDetail> {
  return requestJson(`/api/payments/${id}`);
}

export function confirmPayment(id: string, partial = false) {
  return requestJson(`/api/payments/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partial }),
  });
}

export function rejectPayment(
  id: string,
  options: { notifyCustomer?: boolean; reason?: string } = {},
) {
  return requestJson(`/api/payments/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
}

export function paymentMediaUrl(sessionId: string, proofId: string): string {
  return `/api/payments/${sessionId}/media/${proofId}`;
}
