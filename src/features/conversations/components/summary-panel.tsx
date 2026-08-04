"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ConversationSummaryView } from "@/features/conversations/types";

/**
 * Read-only view of what the bot remembers about this customer, with one action:
 * throw it away.
 *
 * This panel is a safety control, not a convenience. The summary is the only part
 * of the prompt that is model-generated, persisted, and replayed on every later
 * reply, so a summary poisoned by a hostile message would keep influencing
 * answers long after that message scrolled away. Capping and sanitizing it bounds
 * the damage; letting an operator *see* it is what makes the damage noticeable,
 * and wiping it is what makes it recoverable.
 *
 * Read-only by design. An editable summary sounds friendlier and is worse: it
 * would be a second way for text to enter the prompt, with none of the caps or
 * sanitization the generated path enforces. Regenerating from the real messages
 * is both safer and usually what the operator actually wants.
 */
export function SummaryPanel({
  summary,
  summarizedThroughAt,
  onRegenerate,
  loading,
}: {
  summary: ConversationSummaryView | null;
  summarizedThroughAt: string | null;
  onRegenerate: () => void;
  loading: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Defensive: the column is Prisma `Json`, so a row may not match the shape the
  // current validator would produce. Anything unexpected renders as absent
  // rather than crashing the thread.
  const asList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  const asText = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;

  const sections: Array<{ label: string; items: string[] }> = [
    { label: "Preferencias", items: asList(summary?.preferences) },
    { label: "Comprometido", items: asList(summary?.commitments) },
    { label: "Pendiente", items: asList(summary?.openItems) },
    { label: "Datos que ya dio", items: asList(summary?.facts) },
  ].filter((s) => s.items.length > 0);

  const name = asText(summary?.customerName);
  const notes = asText(summary?.notes);
  const hasAnything = Boolean(name || notes || sections.length > 0);

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title="Lo que el bot recuerda de este cliente"
            aria-label="Memoria del cliente"
          >
            <Brain className="h-4 w-4" />
            {hasAnything && <span className="text-xs font-medium">•</span>}
          </button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Memoria del cliente</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {!hasAnything && (
              <p className="text-sm text-muted-foreground">
                Todavía no hay resumen. Se genera solo cuando la conversación
                acumula suficientes mensajes.
              </p>
            )}

            {name && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Cliente
                </p>
                <p className="text-sm">{name}</p>
              </div>
            )}

            {sections.map((section) => (
              <div key={section.label}>
                <p className="text-xs font-medium text-muted-foreground">
                  {section.label}
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-sm">
                  {section.items.map((item, i) => (
                    <li key={`${section.label}-${i}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}

            {notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Notas
                </p>
                <p className="text-sm">{notes}</p>
              </div>
            )}

            {hasAnything && (
              <>
                <p className="text-xs text-muted-foreground">
                  Esto es lo que el bot tiene en cuenta además de los últimos
                  mensajes. Si algo está mal o te resulta raro, regeneralo.
                </p>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => setConfirmOpen(true)}
                >
                  Regenerar resumen
                </Button>
              </>
            )}

            {summarizedThroughAt && (
              <p className="text-xs text-muted-foreground">
                Cubre los mensajes hasta{" "}
                {new Date(summarizedThroughAt).toLocaleString("es")}.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Regenerar el resumen?</DialogTitle>
            <DialogDescription>
              Se borra lo que el bot recuerda de este cliente. Vuelve a armarlo
              solo, a partir de los mensajes reales, la próxima vez que la
              conversación acumule suficientes mensajes nuevos. Los mensajes no
              se tocan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onRegenerate();
              }}
            >
              Regenerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
