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

export function BusinessListTable({
  businesses,
}: {
  businesses: BusinessListItem[];
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
            <TableHead>Phone ID</TableHead>
            <TableHead>Activo</TableHead>
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
              <TableCell>{b.isActive ? "Sí" : "No"}</TableCell>
              <TableCell>
                <Link
                  href={`/businesses/${b.id}/edit`}
                  className="text-primary hover:underline"
                >
                  Editar
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
