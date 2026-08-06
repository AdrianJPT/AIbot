import type { BusinessInput } from "@/features/businesses/types";
import { requestJson } from "@/lib/api-client";

export function inviteClient(payload: {
  email: string;
  name?: string;
  business?: Omit<BusinessInput, "ownerId">;
  businessId?: string;
}) {
  return requestJson("/api/admin/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function resendClientInvite(clientId: string) {
  return requestJson<{ ok: true; method: "invite" | "magiclink" }>(
    `/api/admin/clients/${clientId}/resend-invite`,
    { method: "POST" },
  );
}
