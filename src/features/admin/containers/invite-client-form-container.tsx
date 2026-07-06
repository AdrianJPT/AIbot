"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessFormFields } from "@/features/businesses/components/business-form";
import { fetchCredentials } from "@/features/businesses/api";
import { inviteClient } from "@/features/admin/api";

/**
 * Combined "invite a new client" flow: collects the client's email/name
 * together with their first business + phone number in one screen, so the
 * business is already assigned (Business.ownerId is required) before the
 * invite email goes out — see docs/plan/07-waba-phone-numbers.md.
 */
export function InviteClientFormContainer() {
  const router = useRouter();
  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentials,
  });

  const mutation = useMutation({
    mutationFn: inviteClient,
    onSuccess: () => {
      toast.success("Cliente invitado con su negocio asignado");
      router.push("/admin/clients");
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al invitar"),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    let businessInfo: Record<string, string> = {};
    try {
      businessInfo = JSON.parse((fd.get("businessInfo") as string) || "{}");
    } catch {
      toast.error("businessInfo debe ser JSON válido");
      return;
    }

    mutation.mutate({
      email: fd.get("clientEmail") as string,
      name: (fd.get("clientName") as string) || undefined,
      business: {
        name: fd.get("name") as string,
        phoneNumberId: fd.get("phoneNumberId") as string,
        displayPhone: (fd.get("displayPhone") as string) || null,
        whatsappToken: fd.get("whatsappToken") as string,
        systemPrompt: fd.get("systemPrompt") as string,
        welcomeMessage: fd.get("welcomeMessage") as string,
        businessInfo,
        model: fd.get("model") as string,
        visionModel: fd.get("visionModel") as string,
        audioModel: fd.get("audioModel") as string,
        maxHistoryMessages: Number(fd.get("maxHistoryMessages")) || 20,
        isActive: fd.get("isActive") === "on",
        aiCredentialId: (fd.get("aiCredentialId") as string) || null,
        whatsappCredentialId: (fd.get("whatsappCredentialId") as string) || null,
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">Cliente</h2>
        <div className="space-y-1.5">
          <Label htmlFor="clientName">Nombre</Label>
          <Input id="clientName" name="clientName" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clientEmail">Email</Label>
          <Input id="clientEmail" name="clientEmail" type="email" required />
          <p className="text-xs text-muted-foreground">
            Acá le llega el magic link para que inicie sesión o cargue su
            contraseña — también puede entrar con Google.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">Negocio y número</h2>
        <BusinessFormFields credentials={credentials} />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Invitando…" : "Invitar cliente"}
      </Button>
    </form>
  );
}
