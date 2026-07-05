import { redirect } from "next/navigation";
import { DashboardStatsGrid } from "@/features/dashboard/components/dashboard-stats";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { appointmentScope, businessScope, conversationScope, isAdmin } from "@/lib/scope";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const admin = isAdmin(user);

  const ownedBusinesses = admin
    ? []
    : await prisma.business.findMany({
        where: businessScope(user),
        select: { id: true },
      });
  const businessIds = ownedBusinesses.map((b) => b.id);

  const [activeBusinesses, convToday, pendingAppointments, errorsLast24h] =
    await Promise.all([
      prisma.business.count({ where: { ...businessScope(user), isActive: true } }),
      prisma.conversation.count({
        where: { ...conversationScope(user), createdAt: { gte: startOfDay } },
      }),
      prisma.appointment.count({
        where: { ...appointmentScope(user), status: "pending" },
      }),
      prisma.eventLog.count({
        where: {
          level: "error",
          createdAt: { gte: last24h },
          ...(admin ? {} : { OR: [{ businessId: { in: businessIds } }, { businessId: null }] }),
        },
      }),
    ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <DashboardStatsGrid
        stats={{ activeBusinesses, convToday, pendingAppointments, errorsLast24h }}
      />
    </div>
  );
}
