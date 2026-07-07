"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationListItemRow } from "@/features/conversations/components/conversation-list-item";
import type {
  ConversationFilter,
  ConversationListItem,
} from "@/features/conversations/types";
import type { BusinessOption, PhoneNumberItem } from "@/features/businesses/types";

const SELECT_CLASSNAME =
  "flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
  numberFilterLabel,
  loading,
  businesses,
  businessId,
  onBusinessIdChange,
  phoneNumbers,
  phoneNumberId,
  onPhoneNumberIdChange,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  search: string;
  onSearchChange: (value: string) => void;
  filter: ConversationFilter;
  onFilterChange: (value: ConversationFilter) => void;
  showBusinessBadge: boolean;
  numberFilterLabel?: string;
  loading: boolean;
  businesses: BusinessOption[];
  businessId?: string;
  onBusinessIdChange: (id: string | undefined) => void;
  phoneNumbers: PhoneNumberItem[];
  phoneNumberId?: string;
  onPhoneNumberIdChange: (id: string | undefined) => void;
}) {
  // A single-business client sees a business with one entry — the filter
  // would be a no-op, so it's not worth the UI clutter (mirrors
  // showBusinessBadge's "only matters with more than one" logic).
  const showBusinessFilter = businesses.length > 1;
  // A `?phoneNumberId=` deep link (from a business's per-number page) already
  // shows the "viewing X" banner below with its own "Ver todas" escape
  // hatch — don't also show a number select with no business chosen to
  // populate it from.
  const showNumberFilter = !!businessId && !numberFilterLabel;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <h1 className="px-1 text-lg font-bold">Conversaciones</h1>
        {numberFilterLabel && (
          <p className="px-1 text-sm text-muted-foreground">
            Viendo <span className="font-medium text-foreground">{numberFilterLabel}</span>{" "}
            ·{" "}
            <Link href="/conversations" className="text-primary hover:underline">
              Ver todas
            </Link>
          </p>
        )}
        {(showBusinessFilter || showNumberFilter) && (
          <div className="flex gap-2">
            {showBusinessFilter && (
              <select
                aria-label="Filtrar por negocio"
                className={SELECT_CLASSNAME}
                value={businessId ?? ""}
                onChange={(e) => onBusinessIdChange(e.target.value || undefined)}
              >
                <option value="">Todos los negocios</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            {showNumberFilter && (
              <select
                aria-label="Filtrar por número"
                className={SELECT_CLASSNAME}
                value={phoneNumberId ?? ""}
                onChange={(e) => onPhoneNumberIdChange(e.target.value || undefined)}
              >
                <option value="">Todos los números</option>
                {phoneNumbers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayPhone || p.phoneNumberId}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
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
