import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConversationListItem } from "@/features/conversations/types";

export function ConversationListTable({
  conversations,
}: {
  conversations: ConversationListItem[];
}) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        No hay conversaciones.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Negocio</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Actualizado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {conversations.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono font-medium">
                {c.customerPhone}
              </TableCell>
              <TableCell>{c.business.name}</TableCell>
              <TableCell>{c.status}</TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(c.updatedAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <Link
                  href={`/conversations/${c.id}`}
                  className="text-primary hover:underline"
                >
                  Ver
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
