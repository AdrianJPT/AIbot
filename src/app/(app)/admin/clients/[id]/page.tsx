import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClientBusinessesTable } from "@/features/admin/components/client-businesses-table";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { aggregateBusinessActivity } from "@/lib/business-activity";

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  if (!user) redirect("/");

  const { id } = await params;
  const client = await prisma.user.findUnique({
    where: { id },
    include: {
      businesses: {
        orderBy: { name: "asc" },
        include: {
          conversations: { select: { unreadCount: true, lastMessageAt: true } },
        },
      },
    },
  });
  if (!client) notFound();

  const businesses = client.businesses.map(({ conversations, ...business }) => ({
    ...business,
    ...aggregateBusinessActivity(conversations),
  }));

  return (
    <div>
      <Link
        href="/admin/clients"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Clientes
      </Link>
      <h1 className="mb-1 text-2xl font-bold">{client.name || client.email}</h1>
      <p className="mb-6 text-muted-foreground">{client.email}</p>
      <ClientBusinessesTable businesses={businesses} />
    </div>
  );
}
