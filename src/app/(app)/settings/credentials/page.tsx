import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { CredentialsPanelContainer } from "@/features/credentials/containers/credentials-panel-container";
import { AiDefaultsContainer } from "@/features/settings/containers/ai-defaults-container";

export default async function CredentialsPage() {
  const user = await requireAdmin();
  if (!user) redirect("/");

  const credentials = await prisma.credential.findMany({
    orderBy: [{ kind: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      provider: true,
      label: true,
      keyLast4: true,
      baseUrl: true,
      isActive: true,
      priority: true,
      lastUsedAt: true,
      lastError: true,
      createdAt: true,
    },
  });

  const aiDefaults = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: {
      whatsappCredentialId: true,
      chatModel: true,
      visionModel: true,
      audioModel: true,
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold">Credenciales</h1>
        <CredentialsPanelContainer initialCredentials={credentials} />
      </div>
      <AiDefaultsContainer
        initialDefaults={aiDefaults}
        whatsappCredentials={credentials
          .filter((c) => c.kind === "whatsapp")
          .map(({ id, label, provider }) => ({ id, label, provider }))}
      />
    </div>
  );
}
