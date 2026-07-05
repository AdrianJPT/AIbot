import { SidebarNav } from "@/features/dashboard/components/sidebar-nav";

type SidebarUser = {
  email: string;
  name?: string | null;
  role: string;
};

/**
 * Fixed desktop sidebar (md+). On mobile the same nav renders inside the
 * Sheet drawer via `MobileNav` — see `mobile-nav.tsx`.
 */
export function AppSidebar({ user }: { user: SidebarUser }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6 md:flex">
      <SidebarNav user={user} />
    </aside>
  );
}
