import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { initialsFrom, relativeTime, MEDIA_ICON } from "@/features/conversations/lib/format";
import type { ConversationListItem } from "@/features/conversations/types";

export function ConversationListItemRow({
  conversation,
  active,
  showBusinessBadge,
}: {
  conversation: ConversationListItem;
  active: boolean;
  showBusinessBadge: boolean;
}) {
  const name = conversation.customerName || conversation.customerPhone;
  const preview = previewText(conversation);

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className={cn(
        "flex items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/50",
        active && "bg-muted"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
        {initialsFrom(conversation.customerName, conversation.customerPhone)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {relativeTime(conversation.lastMessageAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-sm text-muted-foreground">{preview}</span>
          {conversation.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {conversation.unreadCount}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {showBusinessBadge && (
            <Badge variant="outline" className="text-[10px]">
              {conversation.business.name}
            </Badge>
          )}
          {conversation.status === "handed_off" && (
            <Badge variant="secondary" className="text-[10px]">
              Atención humana
            </Badge>
          )}
          {conversation.status === "closed" && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Cerrada
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function previewText(conversation: ConversationListItem): string {
  const last = conversation.lastMessage;
  if (!last) return "Sin mensajes";
  if (last.mediaType !== "text" && MEDIA_ICON[last.mediaType]) {
    return `${MEDIA_ICON[last.mediaType]} ${last.content}`;
  }
  return last.content;
}
