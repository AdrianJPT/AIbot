import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AI_PROVIDERS = ["openai", "openrouter", "google"];

export function AddCredentialForm({
  kind,
  provider,
  label,
  apiKey,
  baseUrl,
  saving,
  onKindChange,
  onProviderChange,
  onLabelChange,
  onKeyChange,
  onBaseUrlChange,
  onSubmit,
}: {
  kind: "ai" | "whatsapp";
  provider: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  saving: boolean;
  onKindChange: (kind: "ai" | "whatsapp") => void;
  onProviderChange: (provider: string) => void;
  onLabelChange: (label: string) => void;
  onKeyChange: (key: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">Agregar credencial</h2>
      <form onSubmit={onSubmit} className="max-w-xl space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cred-kind">Tipo</Label>
          <select
            id="cred-kind"
            value={kind}
            onChange={(e) => onKindChange(e.target.value as "ai" | "whatsapp")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="ai">IA</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        {kind === "ai" && (
          <div className="space-y-1.5">
            <Label htmlFor="cred-provider">Proveedor</Label>
            <select
              id="cred-provider"
              value={provider}
              onChange={(e) => onProviderChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cred-label">Label</Label>
          <Input
            id="cred-label"
            required
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cred-key">Clave / token</Label>
          <Input
            id="cred-key"
            required
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
          />
        </div>
        {kind === "ai" && (
          <div className="space-y-1.5">
            <Label htmlFor="cred-baseurl">Base URL (opcional)</Label>
            <Input
              id="cred-baseurl"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder="usa el default del proveedor si se deja vacío"
            />
          </div>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Agregar credencial"}
        </Button>
      </form>
    </div>
  );
}
