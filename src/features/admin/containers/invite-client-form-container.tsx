"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessFormFields } from "@/features/businesses/components/business-form";
import { BusinessPicker } from "@/features/admin/components/business-picker";
import { fetchCredentials } from "@/features/businesses/api";
import { inviteClient } from "@/features/admin/api";

type BusinessMode = "existing" | "new" | "none";

/**
 * "Invite a new client" flow. The business can be an existing admin-built
 * one (business-first onboarding: set it up, then hand it over here), a new
 * one created inline, or none at all (assign later from the business's
 * edit page) — see docs/plan/07-waba-phone-numbers.md.
 */
export function InviteClientFormContainer({
  assignableBusinesses,
}: {
  assignableBusinesses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [businessMode, setBusinessMode] = useState<BusinessMode>(
    assignableBusinesses.length > 0 ? "existing" : "new"
  );
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>(
    assignableBusinesses[0]?.id ?? ""
  );
  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentials,
  });

  const mutation = useMutation({
    mutationFn: inviteClient,
    onSuccess: () => {
      toast.success("Cliente invitado");
      router.push("/admin/clients");
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al invitar"),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const email = fd.get("clientEmail") as string;
    const name = (fd.get("clientName") as string) || undefined;

    if (businessMode === "existing") {
      if (!selectedBusinessId) {
        toast.error("Elegí el negocio a asignar");
        return;
      }
      mutation.mutate({ email, name, businessId: selectedBusinessId });
      return;
    }

    if (businessMode === "none") {
      mutation.mutate({ email, name });
      return;
    }

    let businessInfo: Record<string, string> = {};
    try {
      businessInfo = JSON.parse((fd.get("businessInfo") as string) || "{}");
    } catch {
      toast.error("businessInfo debe ser JSON válido");
      return;
    }

    mutation.mutate({
      email,
      name,
      business: {
        name: fd.get("name") as string,
        phoneNumberId: (fd.get("phoneNumberId") as string) || null,
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
        <h2 className="font-medium">Negocio</h2>
        <div className="space-y-1.5">
          <Label htmlFor="businessMode">Qué negocio asignarle</Label>
          <select
            id="businessMode"
            value={businessMode}
            onChange={(e) => setBusinessMode(e.target.value as BusinessMode)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="existing" disabled={assignableBusinesses.length === 0}>
              Un negocio existente
            </option>
            <option value="new">Crear uno nuevo</option>
            <option value="none">Ninguno (asignar después)</option>
          </select>
        </div>

        {businessMode === "existing" && (
          <div className="space-y-1.5">
            <Label>Negocio</Label>
            <BusinessPicker
              businesses={assignableBusinesses}
              selectedId={selectedBusinessId}
              onSelect={setSelectedBusinessId}
              emptyLabel="No tenés negocios propios disponibles para asignar."
            />
            <p className="text-xs text-muted-foreground">
              Solo se listan los negocios que todavía son tuyos (creados desde
              Negocios y aún sin cliente).
            </p>
          </div>
        )}

        {businessMode === "new" && <BusinessFormFields credentials={credentials} />}
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Invitando…" : "Invitar cliente"}
      </Button>
    </form>
  );
}
