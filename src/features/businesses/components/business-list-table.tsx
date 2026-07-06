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

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
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
    </div>
  );
}
