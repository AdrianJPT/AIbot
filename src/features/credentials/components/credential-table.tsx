import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Credential } from "@/features/credentials/types";

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "active") return "default";
  if (status === "revoked") return "destructive";
  return "secondary";
}

function statusLabel(status: string): string {
  if (status === "active") return "Activa";
  if (status === "revoked") return "Revocada";
  return "En espera";
}

export function CredentialTable({
  title,
  credentials,
  busyId,
  testResults,
  phoneNumberIds,
  onPhoneNumberIdChange,
  onTest,
  onActivate,
  onRevoke,
  onDelete,
}: {
  title: string;
  credentials: Credential[];
  busyId: string | null;
  testResults: Record<string, string>;
  phoneNumberIds: Record<string, string>;
  onPhoneNumberIdChange: (id: string, value: string) => void;
  onTest: (credential: Credential) => void;
  onActivate: (id: string) => void;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
}) {
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
                <TableHead>Label</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Clave</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((c) => {
                const busy = busyId === c.id;
                return (
                  <TableRow key={c.id} className="align-top">
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.provider}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      •••• {c.keyLast4}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)}>
                        {statusLabel(c.status)}
                      </Badge>
                      {c.lastError && (
                        <p
                          className="mt-1 max-w-xs text-xs text-destructive"
                          title={c.lastError}
                        >
                          {c.lastError}
                        </p>
                      )}
                      {testResults[c.id] && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {testResults[c.id]}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleString("es-AR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.kind === "whatsapp" && (
                          <Input
                            placeholder="phone_number_id"
                            value={phoneNumberIds[c.id] || ""}
                            onChange={(e) =>
                              onPhoneNumberIdChange(c.id, e.target.value)
                            }
                            className="h-8 w-32 text-xs"
                          />
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy || c.status === "revoked"}
                          onClick={() => onTest(c)}
                          title="Hace una llamada real y mínima al proveedor para confirmar que la clave funciona, sin cambiar su estado."
                        >
                          Probar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || c.status !== "standby"}
                          onClick={() => onActivate(c.id)}
                          title="La pone en uso y pasa a standby cualquier otra credencial activa del mismo tipo."
                        >
                          Activar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || c.status === "revoked"}
                          onClick={() => onRevoke(c.id)}
                          title="Deja de poder usarse (no se borra). Bloqueado si algún negocio o el default de Configuración la está usando."
                        >
                          Revocar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy || c.status !== "revoked"}
                          onClick={() => onDelete(c.id)}
                          title="Borra la credencial para siempre. Solo se puede eliminar una vez revocada y sin uso."
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
