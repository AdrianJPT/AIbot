import { redirect } from "next/navigation";
import { ClientsTable } from "@/features/admin/components/clients-table";
import { InviteClientDialog } from "@/features/admin/containers/invite-client-dialog";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { aggregateBusinessActivity } from "@/lib/business-activity";

export default async function AdminClientsPage() {
  const user = await requireAdmin();
  if (!user) redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      businesses: {
        select: {
          isActive: true,
          conversations: { select: { unreadCount: true, lastMessageAt: true } },
        },
      },
    },
  });

  const clients = users.map((u) => {
    const activeBusinessesCount = u.businesses.filter((b) => b.isActive).length;
    const conversations = u.businesses.flatMap((b) => b.conversations);
    const { unreadCount, lastActivityAt } = aggregateBusinessActivity(conversations);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      businessesCount: u.businesses.length,
      activeBusinessesCount,
      unreadCount,
      lastActivityAt,
    };
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <InviteClientDialog />
      </div>
      <ClientsTable clients={clients} />
    </div>
  );
}
