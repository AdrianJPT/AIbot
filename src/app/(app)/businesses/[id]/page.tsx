import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { businessScope, isAdmin } from "@/lib/scope";
import { PhoneNumbersPanelContainer } from "@/features/businesses/containers/phone-numbers-panel-container";

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { id } = await params;
  const business = await prisma.business.findFirst({
    where: { id, ...businessScope(user) },
    include: { phoneNumbers: { orderBy: { createdAt: "asc" } } },
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
      <h1 className="mb-2 text-2xl font-bold">{business.name}</h1>
      <p className="mb-6 text-muted-foreground">
        Números de WhatsApp asociados a este negocio — entrá a uno para ver sus
        conversaciones.
      </p>
      <PhoneNumbersPanelContainer
        businessId={business.id}
        canManage={isAdmin(user)}
        initialPhoneNumbers={business.phoneNumbers}
      />
    </div>
  );
}
