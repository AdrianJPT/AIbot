"use client";

import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationListPaneContainer } from "@/features/conversations/containers/conversation-list-pane-container";

/**
 * WhatsApp-style two-pane shell for `/conversations` and `/conversations/[id]`.
 *
 * - Desktop (md+): list pane (fixed ~360px) and thread pane side by side.
 *   When no conversation is selected, the thread pane shows an empty state
 *   instead of `children`.
 * - Mobile (<md): only one pane is visible at a time, driven by the route —
 *   the list fills the screen at `/conversations`, and the thread fills the
 *   screen at `/conversations/[id]` (with its own back header).
 */
export function ConversationsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isListOnly = pathname === "/conversations";

  return (
    <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-border">
      <div
        className={cn(
          "w-full flex-col md:flex md:w-[360px] md:shrink-0 md:border-r md:border-border",
          isListOnly ? "flex" : "hidden md:flex"
        )}
      >
        <ConversationListPaneContainer />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 flex-col",
          isListOnly ? "hidden md:flex" : "flex"
        )}
      >
        {isListOnly ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10" />
            <p>Elegí una conversación para empezar</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
