import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { BusinessDetail, CredentialOption } from "@/features/businesses/types";

export function BusinessForm({
  business,
  credentials,
  submitting,
  onSubmit,
  fixedOwnerLabel,
}: {
  business?: BusinessDetail;
  credentials: CredentialOption[];
  submitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  fixedOwnerLabel?: string;
}) {
  const infoStr = business
    ? JSON.stringify(business.businessInfo, null, 2)
    : `{
  "Horario": "Lun-Vie 9-18",
  "Dirección": "",
  "Teléfono": ""
}`;

  const aiCredentials = credentials.filter((c) => c.kind === "ai");
  const waCredentials = credentials.filter((c) => c.kind === "whatsapp");

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-4">
      {fixedOwnerLabel && (
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Input value={fixedOwnerLabel} disabled />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required defaultValue={business?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="displayPhone">Número de WhatsApp</Label>
        <Input
          id="displayPhone"
          name="displayPhone"
          required
          placeholder="ej: +54 9 11 1234-5678"
          defaultValue={business?.displayPhone ?? ""}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phoneNumberId">ID técnico (Meta)</Label>
        <Input
          id="phoneNumberId"
          name="phoneNumberId"
          required
          defaultValue={business?.phoneNumberId}
        />
        <p className="text-xs text-muted-foreground">
          El Phone Number ID que asigna Meta al registrar el número en la
          WABA — se encuentra en WhatsApp Manager, no es el número en sí.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whatsappToken">WhatsApp token (fallback, opcional)</Label>
        <Input
          id="whatsappToken"
          name="whatsappToken"
          type="password"
          autoComplete="off"
          defaultValue={business?.whatsappToken}
        />
        <p className="text-xs text-muted-foreground">
          Se usa solo si no hay una credencial de WhatsApp asignada abajo.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="aiCredentialId">Credencial de IA (opcional)</Label>
        <select
          id="aiCredentialId"
          name="aiCredentialId"
          defaultValue={business?.aiCredentialId || ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Usar clave global por defecto</option>
          {aiCredentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.provider}, {c.status})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whatsappCredentialId">
          Credencial de WhatsApp (opcional)
        </Label>
        <select
          id="whatsappCredentialId"
          name="whatsappCredentialId"
          defaultValue={business?.whatsappCredentialId || ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Usar el token ingresado arriba</option>
          {waCredentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.status})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="welcomeMessage">
          Mensaje bienvenida (usa {"{businessName}"})
        </Label>
        <Input
          id="welcomeMessage"
          name="welcomeMessage"
          required
          defaultValue={business?.welcomeMessage}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="systemPrompt">
          System prompt ({"{businessName}"}, {"{businessInfo}"})
        </Label>
        <Textarea
          id="systemPrompt"
          name="systemPrompt"
          required
          rows={8}
          className="font-mono text-sm"
          defaultValue={business?.systemPrompt}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="businessInfo">businessInfo (JSON)</Label>
        <Textarea
          id="businessInfo"
          name="businessInfo"
          required
          rows={6}
          className="font-mono text-sm"
          defaultValue={infoStr}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="model">Modelo (chat)</Label>
          <Input
            id="model"
            name="model"
            placeholder="vacío = default de Admin"
            defaultValue={business?.model ?? ""}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="visionModel">Modelo visión</Label>
          <Input
            id="visionModel"
            name="visionModel"
            placeholder="vacío = default de Admin"
            defaultValue={business?.visionModel ?? ""}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="audioModel">Modelo audio</Label>
          <Input
            id="audioModel"
            name="audioModel"
            placeholder="vacío = default de Admin"
            defaultValue={business?.audioModel ?? ""}
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Dejalos vacíos para heredar los modelos por defecto configurados en{" "}
        <a href="/settings/credentials" className="text-primary hover:underline">
          Configuración
        </a>
        . Completalos solo si este cliente necesita un modelo distinto.
      </p>

      <div className="space-y-1.5 max-w-[200px]">
        <Label htmlFor="maxHistoryMessages">Max historial</Label>
        <Input
          id="maxHistoryMessages"
          name="maxHistoryMessages"
          type="number"
          min={1}
          max={100}
          defaultValue={business?.maxHistoryMessages ?? 20}
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="isActive"
          name="isActive"
          defaultChecked={business?.isActive !== false}
        />
        <Label htmlFor="isActive" className="cursor-pointer font-normal">
          Activo
        </Label>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
