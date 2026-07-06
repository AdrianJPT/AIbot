import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiCredentialOption, AiDefaults } from "@/features/settings/types";

export function AiDefaultsForm({
  defaults,
  credentials,
  saving,
  onSubmit,
}: {
  defaults: AiDefaults;
  credentials: AiCredentialOption[];
  saving: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-lg border border-border p-6">
      <div>
        <h2 className="text-lg font-semibold">Valores por defecto de IA</h2>
        <p className="text-sm text-muted-foreground">
          Se usan para cualquier negocio que no tenga su propia credencial o
          modelo asignado. Cambiarlos acá aplica a todos los clientes sin
          override, sin necesidad de deploy.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaultAiCredentialId">Credencial de IA por defecto</Label>
        <select
          id="defaultAiCredentialId"
          name="aiCredentialId"
          defaultValue={defaults.aiCredentialId ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Ninguna (cada negocio necesita la suya)</option>
          {credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.provider}, {c.status})
            </option>
          ))}
        </select>
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

      <Button type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Guardar defaults"}
      </Button>
    </form>
  );
}
