"use client";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationListItemRow } from "@/features/conversations/components/conversation-list-item";
import type {
  ConversationFilter,
  ConversationListItem,
} from "@/features/conversations/types";

const TABS: Array<{ value: ConversationFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "bot", label: "Bot" },
  { value: "human", label: "Humano" },
  { value: "closed", label: "Cerradas" },
];

export function ConversationList({
  conversations,
  activeId,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  showBusinessBadge,
  loading,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  search: string;
  onSearchChange: (value: string) => void;
  filter: ConversationFilter;
  onFilterChange: (value: ConversationFilter) => void;
  showBusinessBadge: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <h1 className="px-1 text-lg font-bold">Conversaciones</h1>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
        />
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as ConversationFilter)}>
          <TabsList className="grid w-full grid-cols-4">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
        ) : conversations.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No hay conversaciones que coincidan.
          </p>
        ) : (
          conversations.map((conversation) => (
            <ConversationListItemRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              showBusinessBadge={showBusinessBadge}
            />
          ))
        )}
      </div>
    </div>
  );
}
