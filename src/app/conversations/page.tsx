import Link from "next/link";
import { redirect } from "next/navigation";
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

  const q = new URLSearchParams();
  if (businessId) q.set("businessId", businessId);
  if (status) q.set("status", status);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Conversaciones</h1>

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
          <option value="active">active</option>
          <option value="handed_off">handed_off</option>
          <option value="closed">closed</option>
        </select>
        <button
          type="submit"
          className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Actualizado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-t border-slate-800">
                <td className="px-4 py-3 font-mono text-white">{c.customerPhone}</td>
                <td className="px-4 py-3">{c.business.name}</td>
                <td className="px-4 py-3">{c.status}</td>
                <td className="px-4 py-3 text-slate-400">
                  {c.updatedAt.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/conversations/${c.id}`}
                    className="text-emerald-400 hover:underline"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="p-6 text-slate-500">No hay conversaciones.</p>
        )}
      </div>
    </div>
  );
}
