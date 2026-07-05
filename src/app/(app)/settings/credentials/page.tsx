import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { CredentialsPanelContainer } from "@/features/credentials/containers/credentials-panel-container";

export default async function CredentialsPage() {
  const user = await requireAdmin();
  if (!user) redirect("/");

  const credentials = await prisma.credential.findMany({
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      provider: true,
      label: true,
      keyLast4: true,
      baseUrl: true,
      status: true,
      lastUsedAt: true,
      lastError: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Credenciales</h1>
      <CredentialsPanelContainer initialCredentials={credentials} />
    </div>
  );
}
