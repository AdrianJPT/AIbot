"use client";

import { Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { fetchConversationAppointments } from "@/features/conversations/api";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  confirmed: "default",
  cancelled: "destructive",
};

/**
 * Read-only "Citas" panel for the chat thread header — shows the customer's
 * appointments linked to this conversation (Appointment.conversationId).
 * No mutations here; appointments are created via the existing
 * /appointments/new flow.
 */
export function AppointmentsPanel({ conversationId }: { conversationId: string }) {
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["conversations", conversationId, "appointments"],
    queryFn: () => fetchConversationAppointments(conversationId),
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          title="Citas del cliente"
          aria-label="Citas del cliente"
        >
          <Calendar className="h-4 w-4" />
          {appointments.length > 0 && (
            <span className="text-xs font-medium">{appointments.length}</span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Citas</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          )}
          {!isLoading && appointments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este cliente no tiene citas asociadas a esta conversación.
            </p>
          )}
          {appointments.map((a) => (
            <div key={a.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.service}</span>
                <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>
                  {a.status}
                </Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {a.date} · {a.time}
              </div>
              {a.notes && (
                <div className="mt-1 text-sm text-muted-foreground">{a.notes}</div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
