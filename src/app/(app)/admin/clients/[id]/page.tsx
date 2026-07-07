import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClientBusinessesTableContainer } from "@/features/admin/containers/client-businesses-table-container";
import { AssociateBusinessDialogContainer } from "@/features/admin/containers/associate-business-dialog-container";
import { ResendInviteButtonContainer } from "@/features/admin/containers/resend-invite-button-container";
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

  // Businesses still owned by the admin are the ones available to hand
  // over — same pool as the invite flow's "existing business" mode (see
  // admin/clients/new/page.tsx).
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{client.name || client.email}</h1>
          <p className="text-muted-foreground">{client.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResendInviteButtonContainer clientId={id} />
          <AssociateBusinessDialogContainer
            clientId={id}
            assignableBusinesses={assignableBusinesses}
          />
          <Button asChild variant="outline">
            <Link href={`/admin/clients/${id}/businesses/new`}>Crear negocio</Link>
          </Button>
        </div>
      </div>
      <ClientBusinessesTableContainer businesses={businesses} adminId={user.id} />
    </div>
  );
}
