import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * `/conversations` renders no content of its own — the list pane and the
 * "elegí una conversación" empty state both live in `ConversationsShell`
 * (see `layout.tsx`), which is route-aware via `usePathname`. This page
 * only exists to satisfy the route and enforce the auth guard.
 */
export default async function ConversationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return null;
}
