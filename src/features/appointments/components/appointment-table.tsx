import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { AppointmentListItem } from "@/features/appointments/types";

export function AppointmentTable({
  appointments,
  busyId,
  onConfirm,
  onCancel,
  onDelete,
}: {
  appointments: AppointmentListItem[];
  busyId: string | null;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (appointments.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        No hay citas.
      </div>
    );
  }

  return [
    <ul key="mobile" aria-label="Citas" className="space-y-3 md:hidden">
      {appointments.map((a) => {
        const busy = busyId === a.id;
        return (
          <li
            key={a.id}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{a.customerName}</p>
                <p className="break-words text-sm text-muted-foreground">
                  {a.business.name}
                </p>
              </div>
              <span className="shrink-0 text-sm">{a.status}</span>
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Teléfono</dt>
                <dd className="break-all font-mono">{a.customerPhone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Servicio</dt>
                <dd className="break-words">{a.service}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd>{a.date}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Hora</dt>
                  <dd>{a.time}</dd>
                </div>
              </div>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11"
                disabled={busy}
                onClick={() => onConfirm(a.id)}
              >
                Confirmar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => onCancel(a.id)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="col-span-2 min-h-11"
                disabled={busy}
                onClick={() => onDelete(a.id)}
              >
                Borrar
              </Button>
            </div>
          </li>
        );
      })}
    </ul>,
    <div
      key="desktop"
      className="hidden overflow-x-auto rounded-lg border border-border md:block"
    >
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead>Negocio</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Servicio</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((a) => {
            const busy = busyId === a.id;
            return (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.business.name}</TableCell>
                <TableCell>{a.customerName}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {a.customerPhone}
                </TableCell>
                <TableCell>{a.service}</TableCell>
                <TableCell>{a.date}</TableCell>
                <TableCell>{a.time}</TableCell>
                <TableCell>{a.status}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onConfirm(a.id)}
                    >
                      Confirmar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onCancel(a.id)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => onDelete(a.id)}
                    >
                      Borrar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>,
  ];
}
