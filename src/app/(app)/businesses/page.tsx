import { redirect } from "next/navigation";
import { BusinessListTable } from "@/features/businesses/components/business-list-table";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { businessScope, isAdmin } from "@/lib/scope";
import { aggregateBusinessActivity } from "@/lib/business-activity";
import { flattenBusinessPhoneNumber } from "@/lib/business-phone-compat";

export default async function BusinessesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const list = await prisma.business.findMany({
    where: businessScope(user),
    orderBy: { name: "asc" },
    include: {
      phoneNumbers: true,
      conversations: { select: { unreadCount: true, lastMessageAt: true } },
    },
  });

  const businesses = list.map(({ conversations, ...business }) => ({
    ...flattenBusinessPhoneNumber(business),
    ...aggregateBusinessActivity(conversations),
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Negocios</h1>
        {isAdmin(user) && (
          <a
            href="/businesses/new"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Nuevo negocio
          </a>
        )}
      </div>
      {isAdmin(user) && (
        <p className="mb-4 text-sm text-muted-foreground">
          Creá el negocio acá, agregale números desde su edición, y cuando
          esté listo asignáselo a un cliente (desde la edición o al{" "}
          <a href="/admin/clients/new" className="text-primary hover:underline">
            invitarlo
          </a>
          ).
        </p>
      )}
      <BusinessListTable businesses={businesses} isAdmin={isAdmin(user)} />
    </div>
  );
}
