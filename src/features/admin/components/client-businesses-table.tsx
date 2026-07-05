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
import type { ClientBusinessItem } from "@/features/admin/types";

function formatLastActivity(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function ClientBusinessesTable({
  businesses,
}: {
  businesses: ClientBusinessItem[];
}) {
  if (businesses.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        Este cliente todavía no tiene negocios.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Negocio</TableHead>
            <TableHead>Phone ID</TableHead>
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
              <TableCell className="font-mono text-muted-foreground">
                {b.phoneNumberId}
              </TableCell>
              <TableCell>
                <Badge variant={b.isActive ? "default" : "secondary"}>
                  {b.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell>{b.conversationsCount}</TableCell>
              <TableCell>{b.unreadCount}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatLastActivity(b.lastActivityAt)}
              </TableCell>
              <TableCell>
                <Link href="/conversations" className="text-primary hover:underline">
                  Ver conversaciones
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
