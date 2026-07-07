import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { InviteClientFormContainer } from "@/features/admin/containers/invite-client-form-container";

export default async function NewClientPage() {
  const user = await requireAdmin();
  if (!user) redirect("/");

  // Businesses still owned by the admin are the ones available to hand over
  // (business-first onboarding: build in Negocios, assign here).
  const assignableBusinesses = await prisma.business.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <Link
        href="/admin/clients"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Clientes
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Invitar cliente</h1>
      <InviteClientFormContainer assignableBusinesses={assignableBusinesses} />
    </div>
  );
}
