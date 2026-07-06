import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BusinessFormContainer } from "@/features/businesses/containers/business-form-container";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export default async function NewClientBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const { id } = await params;
  const client = await prisma.user.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div>
      <Link
        href={`/admin/clients/${id}`}
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← {client.name || client.email}
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Nuevo número</h1>
      <BusinessFormContainer
        fixedOwnerId={client.id}
        fixedOwnerLabel={client.name || client.email}
      />
    </div>
  );
}
