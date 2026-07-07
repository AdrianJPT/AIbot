"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BusinessForm } from "@/features/businesses/components/business-form";
import {
  createBusiness,
  fetchCredentials,
  updateBusiness,
} from "@/features/businesses/api";
import type { BusinessDetail, BusinessInput } from "@/features/businesses/types";

export function BusinessFormContainer({
  business,
  fixedOwnerId,
  fixedOwnerLabel,
  owners,
  currentOwnerId,
}: {
  business?: BusinessDetail;
  fixedOwnerId?: string;
  fixedOwnerLabel?: string;
  owners?: { id: string; label: string }[];
  currentOwnerId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentials,
  });

  const mutation = useMutation({
    mutationFn: (payload: BusinessInput) =>
      business ? updateBusiness(business.id, payload) : createBusiness(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
      toast.success(
        business ? "Negocio actualizado" : "Negocio creado"
      );
      router.push(fixedOwnerId ? `/admin/clients/${fixedOwnerId}` : "/businesses");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error al guardar");
    },
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

    const payload: BusinessInput = {
      name: fd.get("name") as string,
      phoneNumberId: (fd.get("phoneNumberId") as string) || null,
      displayPhone: (fd.get("displayPhone") as string) || null,
      whatsappToken: fd.get("whatsappToken") as string,
      systemPrompt: fd.get("systemPrompt") as string,
      welcomeMessage: fd.get("welcomeMessage") as string,
      businessInfo,
      // Empty means "inherit the admin default" — the API converts "" to
      // null, resolveModels() falls back to AppConfig at call time.
      model: fd.get("model") as string,
      visionModel: fd.get("visionModel") as string,
      audioModel: fd.get("audioModel") as string,
      maxHistoryMessages: Number(fd.get("maxHistoryMessages")) || 20,
      isActive: fd.get("isActive") === "on",
      aiCredentialId: (fd.get("aiCredentialId") as string) || null,
      whatsappCredentialId: (fd.get("whatsappCredentialId") as string) || null,
      ...(fixedOwnerId && { ownerId: fixedOwnerId }),
      ...(owners && fd.get("ownerId") && { ownerId: fd.get("ownerId") as string }),
    };

    mutation.mutate(payload);
  }

  return (
    <BusinessForm
      business={business}
      credentials={credentials.filter((c) => c.status !== "revoked")}
      fixedOwnerLabel={fixedOwnerLabel}
      owners={owners}
      currentOwnerId={currentOwnerId}
      submitting={mutation.isPending}
      onSubmit={onSubmit}
    />
  );
}
