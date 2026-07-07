"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendClientInvite } from "@/features/admin/api";

/**
 * "Reenviar acceso" on the client detail page: re-sends the Supabase invite
 * email, or — once the client has already accepted it once — a magic-link
 * OTP instead (see POST /api/admin/clients/[id]/resend-invite).
 */
export function ResendInviteButtonContainer({ clientId }: { clientId: string }) {
  const mutation = useMutation({
    mutationFn: () => resendClientInvite(clientId),
    onSuccess: (data) => {
      toast.success(
        data.method === "invite"
          ? "Invitación reenviada"
          : "Enlace mágico enviado"
      );
    },
    onError: (error: Error) => toast.error(error.message || "Error al reenviar el acceso"),
  });

  return (
    <Button
      type="button"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? "Enviando…" : "Reenviar acceso"}
    </Button>
  );
}
