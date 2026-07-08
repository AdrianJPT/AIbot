"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Credential, UpdateCredentialInput } from "@/features/credentials/types";

function EditRow({
  credential,
  busy,
  onCancel,
  onSave,
}: {
  credential: Credential;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: UpdateCredentialInput) => void;
}) {
  const [label, setLabel] = useState(credential.label);
  const [baseUrl, setBaseUrl] = useState(credential.baseUrl ?? "");
  const [key, setKey] = useState("");

  function handleSave() {
    onSave({
      label,
      ...(credential.provider === "custom" && { baseUrl: baseUrl || undefined }),
      ...(key && { key }),
    });
  }

  return (
    <TableRow className="bg-muted/40 align-top">
      <TableCell colSpan={5}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8 w-40 text-sm"
            />
          </div>
          {credential.provider === "custom" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Base URL</label>
              <Input
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.tu-proveedor.com/v1"
                className="h-8 w-56 text-sm"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Clave</label>
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Dejar vacío para no cambiarla"
              className="h-8 w-56 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !label}
              onClick={handleSave}
            >
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CredentialTable({
  title,
  credentials,
  busyId,
  onUpdate,
  onSwapPriority,
  onDelete,
  showChainControls = false,
}: {
  title: string;
  credentials: Credential[];
  busyId: string | null;
  onUpdate: (id: string, payload: UpdateCredentialInput) => void;
  /** Atomically swaps the priority of the two given credentials — used by
   * moveUp/moveDown. A single call instead of two independent onUpdate
   * calls avoids the race where the second PATCH could fail after the
   * first succeeded, leaving both rows with the same priority. */
  onSwapPriority: (id: string, withId: string) => void;
  onDelete: (id: string) => void;
  /** Renders the order badge, active toggle, and reorder buttons — only
   * meaningful for "ai" credentials, which are tried in an ordered fallback
   * chain. "whatsapp" credentials don't have chain semantics. */
  showChainControls?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  function moveUp(index: number) {
    if (index === 0) return;
    const current = credentials[index];
    const prev = credentials[index - 1];
    onSwapPriority(current.id, prev.id);
  }

  function moveDown(index: number) {
    if (index === credentials.length - 1) return;
    const current = credentials[index];
    const next = credentials[index + 1];
    onSwapPriority(current.id, next.id);
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {credentials.length === 0 ? (
        <div className="rounded-lg border border-border p-6 text-muted-foreground">
          No hay credenciales de este tipo.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {showChainControls && <TableHead>Orden</TableHead>}
                <TableHead>Label</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Clave</TableHead>
                <TableHead>Último uso</TableHead>
                {showChainControls && <TableHead>Activa</TableHead>}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((c, index) => {
                const busy = busyId === c.id;
                if (editingId === c.id) {
                  return (
                    <EditRow
                      key={c.id}
                      credential={c}
                      busy={busy}
                      onCancel={() => setEditingId(null)}
                      onSave={(payload) => {
                        onUpdate(c.id, payload);
                        setEditingId(null);
                      }}
                    />
                  );
                }
                return (
                  <TableRow key={c.id} className="align-top">
                    {showChainControls && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium"
                            title={
                              index === 0
                                ? "Se intenta primero"
                                : `Alternativa #${index}`
                            }
                          >
                            {index + 1}
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={busy || index === 0}
                              onClick={() => moveUp(index)}
                              className="leading-none text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                              title="Subir prioridad"
                              aria-label="Subir prioridad"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={busy || index === credentials.length - 1}
                              onClick={() => moveDown(index)}
                              className="leading-none text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                              title="Bajar prioridad"
                              aria-label="Bajar prioridad"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.provider}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      •••• {c.keyLast4}
                      {c.lastError && (
                        <p
                          className="mt-1 max-w-xs text-xs text-destructive"
                          title={c.lastError}
                        >
                          {c.lastError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleString("es-AR")
                        : "—"}
                    </TableCell>
                    {showChainControls && (
                      <TableCell>
                        <Switch
                          checked={c.isActive}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            onUpdate(c.id, { isActive: checked })
                          }
                          aria-label={c.isActive ? "Desactivar" : "Activar"}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setEditingId(c.id)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => onDelete(c.id)}
                          title="Borra la credencial para siempre. Bloqueado si algún negocio, número o el default de Configuración la está usando."
                        >
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
