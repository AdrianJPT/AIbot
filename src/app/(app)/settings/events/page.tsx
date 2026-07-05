import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { EventsPanelContainer } from "@/features/events/containers/events-panel-container";

const PAGE_SIZE = 25;

export default async function EventsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ownedBusinesses = await prisma.business.findMany({
    where: { ownerId: user.id },
    select: { id: true },
  });
  const businessIds = ownedBusinesses.map((b) => b.id);

  const events = await prisma.eventLog.findMany({
    where: { OR: [{ businessId: { in: businessIds } }, { businessId: null }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });
  const hasMore = events.length > PAGE_SIZE;
  const page = hasMore ? events.slice(0, PAGE_SIZE) : events;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Eventos y errores</h1>
      <EventsPanelContainer initialEvents={{ events: page, nextCursor }} />
    </div>
  );
}
