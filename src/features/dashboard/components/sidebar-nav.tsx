"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Calendar,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Panel", icon: LayoutDashboard },
  { href: "/conversations", label: "Conversaciones", icon: MessageSquare },
  { href: "/businesses", label: "Negocios", icon: Building2 },
  { href: "/appointments", label: "Citas", icon: Calendar },
  { href: "/settings/credentials", label: "Configuración", icon: KeyRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarUser = {
  email: string;
  name?: string | null;
};

export function SidebarNav({
  user,
  onNavigate,
}: {
  user: SidebarUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-8 text-lg font-semibold text-primary">
        WhatsApp AI
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((l) => {
          const active = isActive(pathname, l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initial}
          </div>
          <span className="truncate text-sm text-muted-foreground">
            {user.email}
          </span>
        </div>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
