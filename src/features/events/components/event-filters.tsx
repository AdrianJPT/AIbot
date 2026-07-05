import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventFilters } from "@/features/events/types";

const LEVELS = ["error", "warn", "info"];
const SOURCES = ["webhook", "ai", "whatsapp-send", "auth", "credentials"];

const ALL = "__all__";

export function EventFiltersBar({
  filters,
  onChange,
}: {
  filters: EventFilters;
  onChange: (next: EventFilters) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={filters.level ?? ALL}
        onValueChange={(v) => onChange({ ...filters, level: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Nivel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los niveles</SelectItem>
          {LEVELS.map((l) => (
            <SelectItem key={l} value={l}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.source ?? ALL}
        onValueChange={(v) => onChange({ ...filters, source: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Origen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los orígenes</SelectItem>
          {SOURCES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
