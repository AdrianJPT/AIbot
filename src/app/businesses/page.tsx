import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function BusinessesPage() {
  const list = await prisma.business.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Negocios</h1>
        <Link
          href="/businesses/new"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Nuevo negocio
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Phone ID</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="border-t border-slate-800">
                <td className="px-4 py-3 text-white">{b.name}</td>
                <td className="px-4 py-3 font-mono text-slate-400">{b.phoneNumberId}</td>
                <td className="px-4 py-3">{b.isActive ? "Sí" : "No"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/businesses/${b.id}/edit`}
                    className="text-emerald-400 hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="p-6 text-slate-500">No hay negocios. Crea uno o ejecuta el seed.</p>
        )}
      </div>
    </div>
  );
}
