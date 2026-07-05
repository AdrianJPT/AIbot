import { StatCard } from "@/features/dashboard/components/stat-card";
import type { DashboardStats } from "@/features/dashboard/types";

export function DashboardStatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Negocios activos" value={stats.activeBusinesses} />
      <StatCard title="Conversaciones hoy" value={stats.convToday} />
      <StatCard title="Citas pendientes" value={stats.pendingAppointments} />
      <StatCard
        title="Errores últimas 24h"
        value={stats.errorsLast24h}
        href="/settings/events"
      />
    </div>
  );
}
