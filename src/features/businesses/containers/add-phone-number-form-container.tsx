"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPhoneNumber, fetchCredentials } from "@/features/businesses/api";

export function AddPhoneNumberFormContainer({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentials,
  });
  const waCredentials = credentials.filter((c) => c.kind === "whatsapp");

  const mutation = useMutation({
    mutationFn: (payload: {
      phoneNumberId: string;
      displayPhone: string | null;
      whatsappToken?: string;
      whatsappCredentialId?: string | null;
    }) => addPhoneNumber(businessId, payload),
    onSuccess: () => {
      toast.success("Número agregado");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["phoneNumbers", businessId] });
    },
    onError: (error: Error) => toast.error(error.message || "Error al agregar"),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      phoneNumberId: fd.get("phoneNumberId") as string,
      displayPhone: (fd.get("displayPhone") as string) || null,
      whatsappToken: fd.get("whatsappToken") as string,
      whatsappCredentialId: (fd.get("whatsappCredentialId") as string) || null,
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Agregar número
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="displayPhone">Número de WhatsApp</Label>
        <Input
          id="displayPhone"
          name="displayPhone"
          required
          placeholder="ej: +54 9 11 1234-5678"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phoneNumberId">ID técnico (Meta)</Label>
        <Input id="phoneNumberId" name="phoneNumberId" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsappToken">WhatsApp token (opcional si elegís una credencial)</Label>
        <Input id="whatsappToken" name="whatsappToken" type="password" autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsappCredentialId">Credencial de WhatsApp (opcional)</Label>
        <select
          id="whatsappCredentialId"
          name="whatsappCredentialId"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Usar el token ingresado arriba</option>
          {waCredentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
