import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BusinessListItem } from "@/features/businesses/types";

function formatLastActivity(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function BusinessListTable({
  businesses,
  isAdmin,
}: {
  businesses: BusinessListItem[];
  isAdmin: boolean;
}) {
  if (businesses.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        No hay negocios. Crea uno o ejecuta el seed.
      </div>
    );
  }

  return [
    <ul key="mobile" aria-label="Negocios" className="space-y-3 md:hidden">
      {businesses.map((b) => (
        <li
          key={b.id}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words font-semibold">{b.name}</h2>
              <p className="text-sm text-muted-foreground">
                {b.displayPhone || "Sin número visible"}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {b.phoneNumberId || "Sin ID técnico"}
              </p>
            </div>
            <span className="shrink-0 text-sm">
              {b.isActive ? "Activo" : "Inactivo"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Conversaciones</dt>
              <dd>{b.conversationsCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">No leídos</dt>
              <dd>{b.unreadCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Última actividad</dt>
              <dd>{formatLastActivity(b.lastActivityAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/businesses/${b.id}`}
              className="inline-flex min-h-11 items-center px-2 text-primary hover:underline"
            >
              Ver números
            </Link>
            {isAdmin && (
              <Link
                href={`/businesses/${b.id}/edit`}
                className="inline-flex min-h-11 items-center px-2 text-primary hover:underline"
              >
                Editar
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>,
    <div
      key="desktop"
      className="hidden overflow-x-auto rounded-lg border border-border md:block"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Número</TableHead>
            <TableHead>Activo</TableHead>
            <TableHead>Conversaciones</TableHead>
            <TableHead>No leídos</TableHead>
            <TableHead>Última actividad</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {businesses.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell>
                <div>{b.displayPhone || "—"}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {b.phoneNumberId}
                </div>
              </TableCell>
              <TableCell>{b.isActive ? "Sí" : "No"}</TableCell>
              <TableCell>{b.conversationsCount}</TableCell>
              <TableCell>{b.unreadCount}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatLastActivity(b.lastActivityAt)}
              </TableCell>
              <TableCell className="space-x-3">
                <Link
                  href={`/businesses/${b.id}`}
                  className="text-primary hover:underline"
                >
                  Ver números
                </Link>
                {isAdmin && (
                  <Link
                    href={`/businesses/${b.id}/edit`}
                    className="text-primary hover:underline"
                  >
                    Editar
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>,
  ];
}
