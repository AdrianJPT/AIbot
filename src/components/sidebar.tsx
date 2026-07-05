import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/businesses", label: "Negocios" },
  { href: "/conversations", label: "Conversaciones" },
  { href: "/appointments", label: "Citas" },
];

export function Sidebar() {
  return (
    <aside className="flex w-52 flex-col border-r border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-8 text-lg font-semibold text-emerald-400">WhatsApp AI</div>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <form action="/auth/logout" method="post">
        <button
          type="submit"
          className="w-full rounded px-3 py-2 text-left text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}
