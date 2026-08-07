import Link from "next/link";
import type { PhoneNumberItem } from "@/features/businesses/types";

export function PhoneNumberList({
  phoneNumbers,
}: {
  phoneNumbers: PhoneNumberItem[];
}) {
  if (phoneNumbers.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        Este negocio todavía no tiene números.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {phoneNumbers.map((p) => (
        <Link
          key={p.id}
          href={`/conversations?phoneNumberId=${p.id}&label=${encodeURIComponent(
            p.displayPhone || p.phoneNumberId,
          )}`}
          className="flex min-w-0 items-center justify-between gap-3 p-4 hover:bg-accent"
        >
          <div className="min-w-0">
            <div className="font-medium">
              {p.displayPhone || p.phoneNumberId}
            </div>
            <div className="break-all font-mono text-xs text-muted-foreground">
              {p.phoneNumberId}
            </div>
          </div>
          <span
            className={
              p.isActive
                ? "shrink-0 text-xs text-green-600"
                : "shrink-0 text-xs text-muted-foreground"
            }
          >
            {p.isActive ? "Activo" : "Inactivo"}
          </span>
        </Link>
      ))}
    </div>
  );
}
