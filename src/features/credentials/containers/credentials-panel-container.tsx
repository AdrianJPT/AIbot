"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddCredentialForm } from "@/features/credentials/components/add-credential-form";
import { CredentialTable } from "@/features/credentials/components/credential-table";
import {
  activateCredential,
  createCredential,
  deleteCredential,
  fetchCredentials,
  revokeCredential,
  testCredential,
} from "@/features/credentials/api";
import type { Credential } from "@/features/credentials/types";

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

  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [phoneNumberIds, setPhoneNumberIds] = useState<Record<string, string>>({});

  const [kind, setKind] = useState<"ai" | "whatsapp">("ai");
  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

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

  const activateMutation = useMutation({
    mutationFn: (id: string) => activateCredential(id),
    onSuccess: () => {
      toast.success("Credencial activada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeCredential(id),
    onSuccess: () => {
      toast.success("Credencial revocada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCredential(id),
    onSuccess: () => {
      toast.success("Credencial eliminada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Error"),
  });

  const testMutation = useMutation({
    mutationFn: (credential: Credential) =>
      testCredential(
        credential.id,
        credential.kind === "whatsapp"
          ? { phoneNumberId: phoneNumberIds[credential.id] }
          : {}
      ).then((result) => ({ credential, result })),
    onSuccess: ({ credential, result }) => {
      setTestResults((prev) => ({
        ...prev,
        [credential.id]: result.ok ? "OK" : result.error || "Falló",
      }));
      refresh();
    },
    onError: (_error: Error, credential: Credential) => {
      setTestResults((prev) => ({ ...prev, [credential.id]: "Error de red" }));
    },
  });

  const busyId =
    activateMutation.variables ??
    revokeMutation.variables ??
    deleteMutation.variables ??
    testMutation.variables?.id ??
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
          testResults={testResults}
          phoneNumberIds={phoneNumberIds}
          onPhoneNumberIdChange={(id, value) =>
            setPhoneNumberIds((prev) => ({ ...prev, [id]: value }))
          }
          onTest={(credential) => testMutation.mutate(credential)}
          onActivate={(id) => activateMutation.mutate(id)}
          onRevoke={(id) => revokeMutation.mutate(id)}
          onDelete={(id) => deleteMutation.mutate(id)}
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
        onProviderChange={setProvider}
        onLabelChange={setLabel}
        onKeyChange={setKey}
        onBaseUrlChange={setBaseUrl}
        onSubmit={onAdd}
      />
    </div>
  );
}
