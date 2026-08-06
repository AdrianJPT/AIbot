"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNav } from "@/features/dashboard/components/sidebar-nav";

type SidebarUser = {
  email: string;
  name?: string | null;
  role: string;
};

/**
 * Mobile-only (<md) top bar with a hamburger button that opens a Sheet
 * drawer containing the same nav as the desktop sidebar.
 */
export function MobileNav({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,var(--safe-area-top))] md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <SheetContent
          side="left"
          className="w-[min(18rem,calc(100vw-2rem))] px-4 pb-[max(1.5rem,var(--safe-area-bottom))] pt-[max(1.5rem,var(--safe-area-top))]"
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarNav user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="text-sm font-semibold text-primary">WhatsApp AI</span>
      <ThemeToggle />
    </header>
  );
}
