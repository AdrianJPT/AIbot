import Link from "next/link";
import { AppointmentRowActions } from "@/components/appointment-row-actions";
import { AppointmentTable } from "@/components/appointment-table";
import { prisma } from "@/lib/db";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { businessId?: string; status?: string; date?: string };
}) {
  const { businessId, status, date } = searchParams;

  const [list, businesses] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...(businessId && { businessId }),
        ...(status && { status }),
        ...(date && { date }),
      },
      orderBy: { createdAt: "desc" },
      include: { business: { select: { name: true } } },
    }),
    prisma.business.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Citas</h1>
        <Link
          href="/appointments/new"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Nueva cita
        </Link>
      </div>

      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <select
          name="businessId"
          defaultValue={businessId || ""}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
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
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        >
          <option value="">Todos los estados</option>
          <option value="pending">pending</option>
          <option value="confirmed">confirmed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <input
          name="date"
          type="text"
          placeholder="Fecha exacta (ej. 2026-04-10)"
          defaultValue={date || ""}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
        <button
          type="submit"
          className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
        >
          Filtrar
        </button>
      </form>

      <AppointmentTable>
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-3">Negocio</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3">Teléfono</th>
              <th className="px-3 py-3">Servicio</th>
              <th className="px-3 py-3">Fecha</th>
              <th className="px-3 py-3">Hora</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="px-3 py-3 text-white">{a.business.name}</td>
                <td className="px-3 py-3">{a.customerName}</td>
                <td className="px-3 py-3 font-mono text-slate-300">{a.customerPhone}</td>
                <td className="px-3 py-3">{a.service}</td>
                <td className="px-3 py-3">{a.date}</td>
                <td className="px-3 py-3">{a.time}</td>
                <td className="px-3 py-3">{a.status}</td>
                <td className="px-3 py-3">
                  <AppointmentRowActions id={a.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="p-6 text-slate-500">No hay citas.</p>
        )}
      </AppointmentTable>
    </div>
  );
}
