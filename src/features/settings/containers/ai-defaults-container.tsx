"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AiDefaultsForm } from "@/features/settings/components/ai-defaults-form";
import { updateAiDefaults } from "@/features/settings/api";
import type { AiCredentialOption, AiDefaults } from "@/features/settings/types";

export function AiDefaultsContainer({
  initialDefaults,
  whatsappCredentials,
}: {
  initialDefaults: AiDefaults;
  whatsappCredentials: AiCredentialOption[];
}) {
  const mutation = useMutation({
    mutationFn: updateAiDefaults,
    onSuccess: () => toast.success("Defaults actualizados"),
    onError: (error: Error) => toast.error(error.message || "Error al guardar"),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      whatsappCredentialId: (fd.get("whatsappCredentialId") as string) || null,
      chatModel: fd.get("chatModel") as string,
      visionModel: fd.get("visionModel") as string,
      audioModel: fd.get("audioModel") as string,
    });
  }

  return (
    <AiDefaultsForm
      defaults={initialDefaults}
      whatsappCredentials={whatsappCredentials}
      saving={mutation.isPending}
      onSubmit={onSubmit}
    />
  );
}
