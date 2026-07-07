"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BusinessPicker, type PickableBusiness } from "@/features/admin/components/business-picker";
import { updateBusiness } from "@/features/businesses/api";

/**
 * "Asociar negocio" dialog on the client detail page: hands over one of the
 * admin's own (still-unassigned) businesses to this client, same notion as
 * the invite flow's "existing business" mode — see
 * InviteClientFormContainer.
 */
export function AssociateBusinessDialogContainer({
  clientId,
  assignableBusinesses,
}: {
  clientId: string;
  assignableBusinesses: PickableBusiness[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: (businessId: string) => updateBusiness(businessId, { ownerId: clientId }),
    onSuccess: () => {
      toast.success("Negocio asociado");
      setOpen(false);
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al asociar el negocio"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Asociar negocio</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asociar negocio</DialogTitle>
          <DialogDescription>
            Elegí uno de tus negocios (todavía sin cliente) para transferírselo a
            este cliente.
          </DialogDescription>
        </DialogHeader>
        <BusinessPicker
          businesses={assignableBusinesses}
          onSelect={(id) => mutation.mutate(id)}
          disabled={mutation.isPending}
          emptyLabel="No tenés negocios propios disponibles para asociar."
        />
      </DialogContent>
    </Dialog>
  );
}
