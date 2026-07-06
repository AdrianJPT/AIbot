import Link from "next/link";
import type { PhoneNumberItem } from "@/features/businesses/types";

export function PhoneNumberList({ phoneNumbers }: { phoneNumbers: PhoneNumberItem[] }) {
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
            p.displayPhone || p.phoneNumberId
          )}`}
          className="flex items-center justify-between p-4 hover:bg-accent"
        >
          <div>
            <div className="font-medium">{p.displayPhone || p.phoneNumberId}</div>
            <div className="font-mono text-xs text-muted-foreground">{p.phoneNumberId}</div>
          </div>
          <span
            className={
              p.isActive ? "text-xs text-green-600" : "text-xs text-muted-foreground"
            }
          >
            {p.isActive ? "Activo" : "Inactivo"}
          </span>
        </Link>
      ))}
    </div>
  );
}
