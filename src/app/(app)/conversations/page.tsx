import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConversationListTable } from "@/features/conversations/components/conversation-list-table";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: { businessId?: string; status?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { businessId, status } = searchParams;

  const [list, businesses] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        business: { ownerId: user.id },
        ...(businessId && { businessId }),
        ...(status && { status }),
      },
      orderBy: { updatedAt: "desc" },
      include: { business: { select: { name: true } } },
    }),
    prisma.business.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Conversaciones</h1>

      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <select
          name="businessId"
          defaultValue={businessId || ""}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Todos los negocios</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status || ""}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Todos los estados</option>
          <option value="active">active</option>
          <option value="handed_off">handed_off</option>
          <option value="closed">closed</option>
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <ConversationListTable conversations={list} />
    </div>
  );
}
