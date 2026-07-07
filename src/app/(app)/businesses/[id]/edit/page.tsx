import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BusinessFormContainer } from "@/features/businesses/containers/business-form-container";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { businessScope } from "@/lib/scope";
import { flattenBusinessPhoneNumber } from "@/lib/business-phone-compat";

export default async function EditBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  if (!user) redirect("/");

  const { id } = await params;
  const business = await prisma.business.findFirst({
    where: { id, ...businessScope(user) },
    include: { phoneNumbers: true },
  });
  if (!business) notFound();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
  const owners = users.map((u) => ({
    id: u.id,
    label: `${u.name || u.email}${u.role === "admin" ? " (admin)" : ""}`,
  }));

  return (
    <div>
      <Link
        href="/businesses"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Negocios
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Editar negocio</h1>
      <BusinessFormContainer
        business={flattenBusinessPhoneNumber(business)}
        owners={owners}
        currentOwnerId={business.ownerId}
      />
    </div>
  );
}
