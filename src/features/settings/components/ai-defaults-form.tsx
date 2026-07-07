"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiCredentialOption, AiDefaults } from "@/features/settings/types";

export function AiDefaultsForm({
  defaults,
  whatsappCredentials,
  saving,
  onSubmit,
}: {
  defaults: AiDefaults;
  whatsappCredentials: AiCredentialOption[];
  saving: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-lg border border-border p-6">
      <div>
        <h2 className="text-lg font-semibold">Valores por defecto</h2>
        <p className="text-sm text-muted-foreground">
          Se usan para cualquier negocio o número que no tenga su propia
          credencial o modelo asignado. Cambiarlos acá aplica a todos los
          clientes sin override, sin necesidad de deploy. La credencial de IA
          por defecto ya no se elige acá — un negocio sin credencial propia
          usa la cadena de credenciales de IA activas de toda la plataforma,
          ordenable en la tabla de arriba.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaultWhatsappCredentialId">
          Credencial de WhatsApp por defecto
        </Label>
        <select
          id="defaultWhatsappCredentialId"
          name="whatsappCredentialId"
          defaultValue={defaults.whatsappCredentialId ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Ninguna (cada número necesita la suya)</option>
          {whatsappCredentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Con el modelo de portfolio único, un token de System User a nivel
          portfolio sirve para todas las WABAs — los números sin credencial
          propia heredan esta.
        </p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="defaultChatModel">Modelo chat</Label>
          <Input
            id="defaultChatModel"
            name="chatModel"
            required
            placeholder="ej: gpt-4o-mini"
            defaultValue={defaults.chatModel}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="defaultVisionModel">Modelo visión</Label>
          <Input
            id="defaultVisionModel"
            name="visionModel"
            required
            placeholder="ej: gpt-4o"
            defaultValue={defaults.visionModel}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="defaultAudioModel">Modelo audio</Label>
          <Input
            id="defaultAudioModel"
            name="audioModel"
            required
            placeholder="ej: whisper-1"
            defaultValue={defaults.audioModel}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Formato de modelo esperado según el proveedor de la credencial que
        termine sirviendo la respuesta: ej. gpt-4o-mini / whisper-1 (OpenAI),
        gemini-2.0-flash (Google — sin audio por esta vía), o
        proveedor/modelo (OpenRouter, ej. openai/gpt-4o-mini).
      </p>

      <Button type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Guardar defaults"}
      </Button>
    </form>
  );
}
