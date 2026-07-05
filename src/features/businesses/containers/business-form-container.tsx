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
}: {
  business?: BusinessDetail;
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
      router.push("/businesses");
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
      phoneNumberId: fd.get("phoneNumberId") as string,
      whatsappToken: fd.get("whatsappToken") as string,
      systemPrompt: fd.get("systemPrompt") as string,
      welcomeMessage: fd.get("welcomeMessage") as string,
      businessInfo,
      model: (fd.get("model") as string) || "gpt-4o-mini",
      maxHistoryMessages: Number(fd.get("maxHistoryMessages")) || 20,
      isActive: fd.get("isActive") === "on",
      aiCredentialId: (fd.get("aiCredentialId") as string) || null,
      whatsappCredentialId: (fd.get("whatsappCredentialId") as string) || null,
    };

    mutation.mutate(payload);
  }

  return (
    <BusinessForm
      business={business}
      credentials={credentials.filter((c) => c.status !== "revoked")}
      submitting={mutation.isPending}
      onSubmit={onSubmit}
    />
  );
}
