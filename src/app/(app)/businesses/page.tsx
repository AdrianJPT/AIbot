import { redirect } from "next/navigation";
import { BusinessListTable } from "@/features/businesses/components/business-list-table";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { businessScope } from "@/lib/scope";
import { aggregateBusinessActivity } from "@/lib/business-activity";
import { flattenBusinessPhoneNumber } from "@/lib/business-phone-compat";

export default async function BusinessesPage() {
  const user = await requireAdmin();
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
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Los números se dan de alta desde{" "}
        <a href="/admin/clients" className="text-primary hover:underline">
          Clientes
        </a>
        , eligiendo el cliente dueño.
      </p>
      <BusinessListTable businesses={businesses} />
    </div>
  );
}
