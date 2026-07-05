import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessOption } from "@/features/appointments/types";

export function NewAppointmentForm({
  businesses,
  submitting,
  onSubmit,
}: {
  businesses: BusinessOption[];
  submitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="businessId">Negocio</Label>
        <select
          id="businessId"
          name="businessId"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">—</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="customerPhone">Teléfono cliente</Label>
        <Input id="customerPhone" name="customerPhone" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="customerName">Nombre</Label>
        <Input id="customerName" name="customerName" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="service">Servicio / motivo</Label>
        <Input id="service" name="service" required />
      </div>
      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" name="date" required placeholder="2026-04-15" />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="time">Hora</Label>
          <Input id="time" name="time" required placeholder="18:00" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Guardando…" : "Crear"}
      </Button>
    </form>
  );
}
