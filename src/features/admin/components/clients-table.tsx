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

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
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
                <Link href={`/admin/clients/${c.id}`} className="hover:underline">
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
    </div>
  );
}
