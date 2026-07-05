import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppointmentsTableContainer } from "@/features/appointments/containers/appointments-table-container";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { appointmentScope, businessScope } from "@/lib/scope";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { businessId?: string; status?: string; date?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { businessId, status, date } = searchParams;

  const [list, businesses] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...appointmentScope(user),
        ...(businessId && { businessId }),
        ...(status && { status }),
        ...(date && { date }),
      },
      orderBy: { createdAt: "desc" },
      include: { business: { select: { name: true } } },
    }),
    prisma.business.findMany({
      where: businessScope(user),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Citas</h1>
        <Button asChild>
          <Link href="/appointments/new">Nueva cita</Link>
        </Button>
      </div>

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
          <option value="pending">pending</option>
          <option value="confirmed">confirmed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <Input
          name="date"
          type="text"
          placeholder="Fecha exacta (ej. 2026-04-10)"
          defaultValue={date || ""}
          className="w-auto"
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <AppointmentsTableContainer appointments={list} />
    </div>
  );
}
