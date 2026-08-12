import { requestJson } from "@/lib/api-client";

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
