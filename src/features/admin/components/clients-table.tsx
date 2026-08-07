import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClientListItem } from "@/features/admin/types";

function formatLastActivity(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function ClientsTable({ clients }: { clients: ClientListItem[] }) {
  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        No hay clientes registrados todavía.
      </div>
    );
  }

  return [
    <ul key="mobile" aria-label="Clientes" className="space-y-3 md:hidden">
      {clients.map((c) => (
        <li
          key={c.id}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/admin/clients/${c.id}`}
                className="flex min-h-11 items-center break-all font-semibold hover:underline"
              >
                {c.name || c.email}
              </Link>
              {c.name && (
                <p className="break-all text-xs text-muted-foreground">
                  {c.email}
                </p>
              )}
            </div>
            <Badge variant={c.role === "admin" ? "default" : "secondary"}>
              {c.role}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Negocios</dt>
              <dd>{c.businessesCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Activos</dt>
              <dd>{c.activeBusinessesCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">No leídos</dt>
              <dd>{c.unreadCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Última actividad</dt>
              <dd>{formatLastActivity(c.lastActivityAt)}</dd>
            </div>
          </dl>
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
            <TableHead>Cliente</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Negocios</TableHead>
            <TableHead>Negocios activos</TableHead>
            <TableHead>No leídos</TableHead>
            <TableHead>Última actividad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="hover:underline"
                >
                  {c.name || c.email}
                </Link>
                {c.name && (
                  <div className="text-xs font-normal text-muted-foreground">
                    {c.email}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={c.role === "admin" ? "default" : "secondary"}>
                  {c.role}
                </Badge>
              </TableCell>
              <TableCell>{c.businessesCount}</TableCell>
              <TableCell>{c.activeBusinessesCount}</TableCell>
              <TableCell>{c.unreadCount}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatLastActivity(c.lastActivityAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>,
  ];
}
