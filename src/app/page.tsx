import { StatsCard } from "@/components/stats-card";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeBusinesses, convToday, pendingAppointments] = await Promise.all([
    prisma.business.count({ where: { isActive: true } }),
    prisma.conversation.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    prisma.appointment.count({ where: { status: "pending" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard title="Negocios activos" value={activeBusinesses} />
        <StatsCard title="Conversaciones hoy" value={convToday} />
        <StatsCard title="Citas pendientes" value={pendingAppointments} />
      </div>
    </div>
  );
}
