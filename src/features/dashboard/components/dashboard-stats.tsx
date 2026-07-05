import { StatCard } from "@/features/dashboard/components/stat-card";
import type { DashboardStats } from "@/features/dashboard/types";

export function DashboardStatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard title="Negocios activos" value={stats.activeBusinesses} />
      <StatCard title="Conversaciones hoy" value={stats.convToday} />
      <StatCard title="Citas pendientes" value={stats.pendingAppointments} />
    </div>
  );
}
