import { redirect } from "next/navigation";
import { DashboardStatsGrid } from "@/features/dashboard/components/dashboard-stats";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const ownedBusinesses = await prisma.business.findMany({
    where: { ownerId: user.id },
    select: { id: true },
  });
  const businessIds = ownedBusinesses.map((b) => b.id);

  const [activeBusinesses, convToday, pendingAppointments, errorsLast24h] =
    await Promise.all([
      prisma.business.count({ where: { ownerId: user.id, isActive: true } }),
      prisma.conversation.count({
        where: { business: { ownerId: user.id }, createdAt: { gte: startOfDay } },
      }),
      prisma.appointment.count({
        where: { business: { ownerId: user.id }, status: "pending" },
      }),
      prisma.eventLog.count({
        where: {
          level: "error",
          createdAt: { gte: last24h },
          OR: [{ businessId: { in: businessIds } }, { businessId: null }],
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
