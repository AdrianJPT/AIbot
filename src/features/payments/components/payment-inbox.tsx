import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { paymentMediaUrl } from "@/features/payments/api";
import type { PaymentInboxItem } from "@/features/payments/types";

const VERDICT_LABELS: Record<string, string> = {
  valid: "Válido",
  needs_attention: "Atención",
  suspicious: "Sospechoso",
  invalid: "Inválido",
  duplicate: "Duplicado",
};

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const value = (amount / 100).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}

function VerdictBadge({ item }: { item: PaymentInboxItem }) {
  const verdict = item.latestProof?.verdict;
  if (!verdict) return null;
  const label = VERDICT_LABELS[verdict] ?? verdict;
  const reason = item.statusReason ? ` · ${item.statusReason}` : "";
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      {label}
      {reason}
    </span>
  );
}

export function PaymentInbox({
  items,
  busyId,
  onConfirm,
  onConfirmPartial,
  onReject,
}: {
  items: PaymentInboxItem[];
  busyId: string | null;
  onConfirm: (id: string) => void;
  onConfirmPartial: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-muted-foreground">
        No hay pagos pendientes de confirmar.
      </div>
    );
  }

  return [
    <ul key="mobile" aria-label="Pagos pendientes" className="space-y-3 md:hidden">
      {items.map((item) => {
        const busy = busyId === item.id;
        const isPartial = item.statusReason === "partial";
        return (
          <li
            key={item.id}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {item.customerName ?? item.customerPhone}
                </p>
                <p className="break-all font-mono text-sm text-muted-foreground">
                  {item.customerPhone}
                </p>
              </div>
              <VerdictBadge item={item} />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Recibido</dt>
                <dd>
                  {formatAmount(
                    item.receivedAmount,
                    item.catalogItem?.currency ?? null,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Restante</dt>
                <dd>
                  {formatAmount(
                    item.remaining,
                    item.catalogItem?.currency ?? null,
                  )}
                </dd>
              </div>
            </dl>
            {item.aiMessage && (
              <p className="rounded bg-muted p-2 text-sm text-muted-foreground">
                IA al cliente: {item.aiMessage}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {item.latestProof?.hasMedia && (
                <Button asChild size="sm" variant="outline" className="min-h-11">
                  <a
                    href={paymentMediaUrl(item.id, item.latestProof.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver comprobante
                  </a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="min-h-11">
                <Link href={`/conversations/${item.conversationId}`}>
                  Ver chat
                </Link>
              </Button>
              {isPartial ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="col-span-2 min-h-11"
                  disabled={busy}
                  onClick={() => onConfirmPartial(item.id)}
                >
                  Confirmar parcial
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="col-span-2 min-h-11"
                  disabled={busy}
                  onClick={() => onConfirm(item.id)}
                >
                  Confirmar
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="col-span-2 min-h-11"
                disabled={busy}
                onClick={() => onReject(item.id)}
              >
                Rechazar
              </Button>
            </div>
          </li>
        );
      })}
    </ul>,
    <div
      key="desktop"
      className="hidden overflow-x-auto rounded-lg border border-border md:block"
    >
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Recibido</TableHead>
            <TableHead>Restante</TableHead>
            <TableHead>Verdicto</TableHead>
            <TableHead>IA al cliente</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const busy = busyId === item.id;
            const isPartial = item.statusReason === "partial";
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <div>{item.customerName ?? item.customerPhone}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {item.customerPhone}
                  </div>
                </TableCell>
                <TableCell>
                  {formatAmount(
                    item.receivedAmount,
                    item.catalogItem?.currency ?? null,
                  )}
                </TableCell>
                <TableCell>
                  {formatAmount(
                    item.remaining,
                    item.catalogItem?.currency ?? null,
                  )}
                </TableCell>
                <TableCell>
                  <VerdictBadge item={item} />
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {item.aiMessage ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.latestProof?.hasMedia && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={paymentMediaUrl(item.id, item.latestProof.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Comprobante
                        </a>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/conversations/${item.conversationId}`}>
                        Ver chat
                      </Link>
                    </Button>
                    {isPartial ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onConfirmPartial(item.id)}
                      >
                        Confirmar parcial
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onConfirm(item.id)}
                      >
                        Confirmar
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => onReject(item.id)}
                    >
                      Rechazar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>,
  ];
}
