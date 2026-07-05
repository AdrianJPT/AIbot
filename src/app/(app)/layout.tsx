import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/features/dashboard/components/app-sidebar";
import { MobileNav } from "@/features/dashboard/components/mobile-nav";
import { getSessionUser } from "@/lib/auth";

/**
 * Authenticated app shell: fixed sidebar on desktop (md+), top bar + Sheet
 * drawer on mobile. Wraps every page under the `(app)` route group — this
 * route group does not affect URLs (still `/`, `/businesses`, etc.), it
 * only groups these pages under a shared layout.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const sidebarUser = { email: user.email, name: user.name, role: user.role };

  return (
    <QueryProvider>
      <div className="flex min-h-screen">
        <AppSidebar user={sidebarUser} />
        <div className="flex min-h-screen flex-1 flex-col">
          <MobileNav user={sidebarUser} />
          <div className="hidden justify-end border-b border-border px-6 py-3 md:flex">
            <ThemeToggle />
          </div>
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      <Toaster />
    </QueryProvider>
  );
}
