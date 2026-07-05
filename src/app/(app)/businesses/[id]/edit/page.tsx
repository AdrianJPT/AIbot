import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BusinessFormContainer } from "@/features/businesses/containers/business-form-container";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { businessScope } from "@/lib/scope";

export default async function EditBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const business = await prisma.business.findFirst({
    where: { id, ...businessScope(user) },
  });
  if (!business) notFound();

  return (
    <div>
      <Link
        href="/businesses"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Negocios
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Editar negocio</h1>
      <BusinessFormContainer business={business} />
    </div>
  );
}
