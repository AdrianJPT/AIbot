"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddPhoneNumberFormContainer } from "@/features/businesses/containers/add-phone-number-form-container";
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
  busyId,
  onToggleActive,
  onUnassign,
  unassigningId,
  onPhoneNumberAdded,
}: {
  businesses: ClientBusinessItem[];
  busyId?: string | null;
  onToggleActive?: (id: string, nextIsActive: boolean) => void;
  // Reassigns the business back to the admin's own account ("Quitar").
  onUnassign?: (id: string) => void;
  unassigningId?: string | null;
  onPhoneNumberAdded?: () => void;
}) {
  const [addingNumberFor, setAddingNumberFor] = useState<string | null>(null);

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
            <Fragment key={b.id}>
              <TableRow>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>
                  <div>{b.displayPhone || "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {b.phoneNumberId}
                  </div>
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
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Link href="/conversations" className="text-primary hover:underline">
                      Ver conversaciones
                    </Link>
                    <Link
                      href={`/businesses/${b.id}/edit`}
                      className="text-primary hover:underline"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() =>
                        setAddingNumberFor(addingNumberFor === b.id ? null : b.id)
                      }
                    >
                      Agregar número
                    </button>
                    {onToggleActive && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === b.id}
                        onClick={() => onToggleActive(b.id, !b.isActive)}
                      >
                        {b.isActive ? "Desactivar" : "Reactivar"}
                      </Button>
                    )}
                    {onUnassign && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={unassigningId === b.id}
                        onClick={() => onUnassign(b.id)}
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {addingNumberFor === b.id && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/30">
                    <AddPhoneNumberFormContainer
                      businessId={b.id}
                      onSuccess={() => {
                        setAddingNumberFor(null);
                        onPhoneNumberAdded?.();
                      }}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
