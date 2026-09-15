"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Platform-wide kill switch for tool-calling (`AppConfig.toolsEnabled`).
 *
 * This is one half of a two-key gate — see `toolsEffectivelyEnabled()` in
 * src/lib/tools/enabled.ts: nothing runs unless this AND a business's own
 * `toolsEnabled` are both on, and this one overrides every business's
 * opt-in. The copy says so explicitly, so an admin doesn't turn this on
 * expecting every business with its own switch on to suddenly start
 * calling tools, and doesn't think turning it off alone is enough to stop a
 * given business (the business's own switch also has to be off, or nothing
 * was ever going to happen for it in the first place).
 */
export function ToolsPlatformCard({
  toolsEnabled,
  saving,
  onSubmit,
}: {
  toolsEnabled: boolean;
  saving: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Tool-calling de la IA (beta)
          </CardTitle>
          <CardDescription>
            Interruptor general de la plataforma. Hace falta que esté prendido
            ACÁ Y ADEMÁS en el negocio puntual (en su formulario de edición)
            para que pase algo — si acá está apagado, un negocio con el suyo
            prendido no gana nada. Hoy la única herramienta registrada es una
            prueba de diagnóstico de solo lectura, así que prender esto sirve
            para probar el circuito, no le suma capacidades nuevas al bot para
            tus clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              id="toolsEnabled"
              name="toolsEnabled"
              defaultChecked={toolsEnabled}
            />
            <Label
              htmlFor="toolsEnabled"
              className="cursor-pointer font-normal"
            >
              Habilitar tool-calling a nivel plataforma
            </Label>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
