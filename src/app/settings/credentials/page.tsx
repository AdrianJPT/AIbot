import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { CredentialsPanel } from "@/components/credentials-panel";

export default async function CredentialsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const credentials = await prisma.credential.findMany({
    where: { ownerId: user.id },
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
      <h1 className="mb-6 text-2xl font-bold text-white">Credenciales</h1>
      <CredentialsPanel initialCredentials={credentials} />
    </div>
  );
}
