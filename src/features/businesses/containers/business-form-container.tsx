"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BusinessForm } from "@/features/businesses/components/business-form";
import {
  createBusiness,
  fetchCredentials,
  updateBusiness,
} from "@/features/businesses/api";
import type {
  BusinessDetail,
  BusinessInput,
} from "@/features/businesses/types";
import { replyWindowMsFromSeconds } from "@/lib/businesses/reply-window";
import type { NicheId, NicheTemplate } from "@/lib/niche-templates";
import { resolveNicheTemplate } from "@/lib/niche-templates";
import { shouldConfirmNicheSwitch } from "@/features/businesses/lib/niche-template-apply";

const NICHE_SWITCH_CONFIRM_MESSAGE =
  "Cambiar el giro va a reemplazar el prompt, el mensaje de bienvenida, la información del negocio y el documento de conocimiento con los valores del nuevo giro. Vas a perder los cambios que hiciste. ¿Continuar?";

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

  // Giro picker state (create mode only — see business's "if (business)"
  // guard around the picker in BusinessFormFields). `templateRevision` is
  // bumped on every applied template so the templated fields remount with
  // fresh `defaultValue`s (design's "Prefill mechanism" decision).
  const [nicheId, setNicheId] = useState<NicheId | "">("");
  const [templateFields, setTemplateFields] = useState<
    NicheTemplate | undefined
  >(undefined);
  const [templateRevision, setTemplateRevision] = useState(0);
  const [hasAppliedTemplate, setHasAppliedTemplate] = useState(false);
  const [dirtySinceTemplate, setDirtySinceTemplate] = useState(false);

  function applyNiche(id: string) {
    setNicheId(id as NicheId | "");
    setTemplateFields(resolveNicheTemplate(id));
    setTemplateRevision((rev) => rev + 1);
    setDirtySinceTemplate(false);
    setHasAppliedTemplate(true);
  }

  function handleNicheChange(id: string) {
    if (shouldConfirmNicheSwitch(hasAppliedTemplate, dirtySinceTemplate)) {
      if (!window.confirm(NICHE_SWITCH_CONFIRM_MESSAGE)) {
        // Cancel reverts the <select> to its prior value — a no-op, since
        // `nicheId` state was never changed.
        return;
      }
    }
    applyNiche(id);
  }

  function handleTemplatedFieldEdit() {
    setDirtySinceTemplate(true);
  }

  const mutation = useMutation({
    mutationFn: (payload: BusinessInput) =>
      business ? updateBusiness(business.id, payload) : createBusiness(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
      toast.success(business ? "Negocio actualizado" : "Negocio creado");
      router.push(
        fixedOwnerId ? `/admin/clients/${fixedOwnerId}` : "/businesses",
      );
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
      knowledgeDoc: (fd.get("knowledgeDoc") as string) ?? "",
      // Empty means "inherit the admin default" — the API converts "" to
      // null, resolveModels() falls back to AppConfig at call time.
      model: fd.get("model") as string,
      visionModel: fd.get("visionModel") as string,
      audioModel: fd.get("audioModel") as string,
      maxHistoryMessages: Number(fd.get("maxHistoryMessages")) || 20,
      // UI collects seconds for readability; the DB column is ms.
      replyWindowMs: replyWindowMsFromSeconds(fd.get("replyWindowSeconds")),
      isActive: fd.get("isActive") === "on",
      aiCredentialId: (fd.get("aiCredentialId") as string) || null,
      whatsappCredentialId: (fd.get("whatsappCredentialId") as string) || null,
      ...(fixedOwnerId && { ownerId: fixedOwnerId }),
      ...(owners &&
        fd.get("ownerId") && { ownerId: fd.get("ownerId") as string }),
    };

    mutation.mutate(payload);
  }

  return (
    <BusinessForm
      business={business}
      credentials={credentials}
      fixedOwnerLabel={fixedOwnerLabel}
      owners={owners}
      currentOwnerId={currentOwnerId}
      submitting={mutation.isPending}
      onSubmit={onSubmit}
      templateFields={templateFields}
      templateRevision={templateRevision}
      nicheId={nicheId}
      onNicheChange={handleNicheChange}
      onTemplatedFieldEdit={handleTemplatedFieldEdit}
    />
  );
}
