"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddCredentialForm } from "@/features/credentials/components/add-credential-form";
import { CredentialTable } from "@/features/credentials/components/credential-table";
import {
  createCredential,
  deleteCredential,
  fetchCredentials,
  swapCredentialPriority,
  updateCredential,
} from "@/features/credentials/api";
import type { Credential, UpdateCredentialInput } from "@/features/credentials/types";

const GROUPS: Array<{ kind: string; title: string }> = [
  { kind: "ai", title: "IA" },
  { kind: "whatsapp", title: "WhatsApp" },
];

export function CredentialsPanelContainer({
  initialCredentials,
}: {
  initialCredentials: Credential[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: credentials = initialCredentials } = useQuery({
    queryKey: ["credentials", "all"],
    queryFn: fetchCredentials,
    initialData: initialCredentials,
  });

  const [kind, setKind] = useState<"ai" | "whatsapp">("ai");
  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  function onProviderChange(next: string) {
    setProvider(next);
    if (next !== "custom") setBaseUrl("");
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["credentials"] });
    router.refresh();
  }

  const createMutation = useMutation({
    mutationFn: createCredential,
    onSuccess: () => {
      toast.success("Credencial agregada");
      setLabel("");
      setKey("");
      setBaseUrl("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al guardar"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCredentialInput }) =>
      updateCredential(id, payload),
    onSuccess: () => {
      toast.success("Credencial actualizada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error al guardar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCredential(id),
    onSuccess: () => {
      toast.success("Credencial eliminada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error"),
  });

  const swapMutation = useMutation({
    mutationFn: ({ id, withId }: { id: string; withId: string }) =>
      swapCredentialPriority(id, withId),
    onSuccess: () => refresh(),
    onError: (error: Error) => toast.error(error.message || "Error al reordenar"),
  });

  const busyId =
    updateMutation.variables?.id ??
    deleteMutation.variables ??
    swapMutation.variables?.id ??
    null;

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    createMutation.mutate({
      kind,
      provider: kind === "whatsapp" ? "meta" : provider,
      label,
      key,
      baseUrl: baseUrl || undefined,
    });
  }

  return (
    <div className="space-y-8">
      {GROUPS.map((g) => (
        <CredentialTable
          key={g.kind}
          title={g.title}
          credentials={credentials.filter((c) => c.kind === g.kind)}
          busyId={busyId}
          showChainControls={g.kind === "ai"}
          onUpdate={(id, payload) => updateMutation.mutate({ id, payload })}
          onSwapPriority={(id, withId) => swapMutation.mutate({ id, withId })}
          onDelete={(id) => {
            if (!confirm("¿Eliminar esta credencial? Esta acción no se puede deshacer.")) {
              return;
            }
            deleteMutation.mutate(id);
          }}
        />
      ))}

      <AddCredentialForm
        kind={kind}
        provider={provider}
        label={label}
        apiKey={key}
        baseUrl={baseUrl}
        saving={createMutation.isPending}
        onKindChange={setKind}
        onProviderChange={onProviderChange}
        onLabelChange={setLabel}
        onKeyChange={setKey}
        onBaseUrlChange={setBaseUrl}
        onSubmit={onAdd}
      />
    </div>
  );
}
