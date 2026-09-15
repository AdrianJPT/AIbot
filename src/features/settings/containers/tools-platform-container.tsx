"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ToolsPlatformCard } from "@/features/settings/components/tools-platform-card";
import { updateToolsPlatformConfig } from "@/features/settings/api";

export function ToolsPlatformContainer({
  initialToolsEnabled,
}: {
  initialToolsEnabled: boolean;
}) {
  const mutation = useMutation({
    mutationFn: updateToolsPlatformConfig,
    onSuccess: () => toast.success("Interruptor actualizado"),
    onError: (error: Error) => toast.error(error.message || "Error al guardar"),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({ toolsEnabled: fd.get("toolsEnabled") === "on" });
  }

  return (
    <ToolsPlatformCard
      toolsEnabled={initialToolsEnabled}
      saving={mutation.isPending}
      onSubmit={onSubmit}
    />
  );
}
