"use client";

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
 * Per-tenant opt-in into tool-calling (`Business.toolsEnabled`).
 *
 * The other half of the two-key gate in `toolsEffectivelyEnabled()` (see
 * src/lib/tools/enabled.ts): this business's switch and the platform-wide
 * switch (Configuración → Tool-calling de la IA) both have to be on, and
 * the platform switch overrides this one — turning this on while the
 * platform switch is off gets this business nothing. The copy says so, so
 * turning this on isn't mistaken for "now it works".
 */
export function ToolsToggleCard({ toolsEnabled }: { toolsEnabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Tool-calling de la IA (beta)
        </CardTitle>
        <CardDescription>
          Además de este interruptor, el interruptor general de la plataforma
          (en Configuración) también tiene que estar prendido — si ese está
          apagado, prender este acá no hace nada. Hoy la única herramienta
          registrada es una prueba de diagnóstico de solo lectura: prender esto
          sirve para probar el circuito, no le suma capacidades nuevas al bot
          para este negocio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Switch
            id="toolsEnabled"
            name="toolsEnabled"
            defaultChecked={toolsEnabled}
          />
          <Label htmlFor="toolsEnabled" className="cursor-pointer font-normal">
            Habilitar tool-calling para este negocio
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
