"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

export type PickableBusiness = { id: string; name: string };

/**
 * Search-by-name + list of businesses, shared by the invite flow's
 * "existing business" mode and the client detail page's "Asociar negocio"
 * dialog — both need to pick one business out of the admin's own
 * (unassigned) businesses. The list is small (an admin's own businesses),
 * so filtering happens in memory; the debounce is only for perceived-typing
 * smoothness, matching the 300ms pattern used for the conversations search.
 */
export function BusinessPicker({
  businesses,
  selectedId,
  onSelect,
  emptyLabel = "No hay negocios disponibles.",
  searchPlaceholder = "Buscar negocio…",
  disabled = false,
}: {
  businesses: PickableBusiness[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim().toLowerCase()),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = debouncedSearch
    ? businesses.filter((b) => b.name.toLowerCase().includes(debouncedSearch))
    : businesses;

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        disabled={businesses.length === 0}
      />
      {businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún negocio coincide con la búsqueda.</p>
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {filtered.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(b.id)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                  selectedId === b.id && "bg-accent font-medium"
                )}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
