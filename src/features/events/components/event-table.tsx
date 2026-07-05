"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EventLogEntry } from "@/features/events/types";

const LEVEL_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  error: "destructive",
  warn: "secondary",
  info: "outline",
};

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function EventTable({ events }: { events: EventLogEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay eventos para los filtros seleccionados.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Fecha</TableHead>
          <TableHead>Nivel</TableHead>
          <TableHead>Origen</TableHead>
          <TableHead>Mensaje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const expanded = expandedId === event.id;
          return (
            <Fragment key={event.id}>
              <TableRow
                className="cursor-pointer"
                onClick={() => setExpandedId(expanded ? null : event.id)}
              >
                <TableCell>
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(event.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={LEVEL_VARIANT[event.level] ?? "outline"}>
                    {event.level}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{event.source}</TableCell>
                <TableCell className="max-w-md truncate text-sm">
                  {event.message}
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow>
                  <TableCell colSpan={5} className="bg-muted/30">
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                      {event.detail
                        ? JSON.stringify(event.detail, null, 2)
                        : "Sin detalle"}
                    </pre>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
