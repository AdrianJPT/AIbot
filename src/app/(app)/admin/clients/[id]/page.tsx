import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClientBusinessesTableContainer } from "@/features/admin/containers/client-businesses-table-container";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { aggregateBusinessActivity } from "@/lib/business-activity";
import { flattenBusinessPhoneNumber } from "@/lib/business-phone-compat";

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
          phoneNumbers: true,
          conversations: { select: { unreadCount: true, lastMessageAt: true } },
        },
      },
    },
  });
  if (!client) notFound();

  const businesses = client.businesses.map(({ conversations, ...business }) => ({
    ...flattenBusinessPhoneNumber(business),
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{client.name || client.email}</h1>
          <p className="text-muted-foreground">{client.email}</p>
        </div>
        <Button asChild>
          <Link href={`/admin/clients/${id}/businesses/new`}>Nuevo número</Link>
        </Button>
      </div>
      <ClientBusinessesTableContainer businesses={businesses} />
    </div>
  );
}
