"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { paymentMediaUrl } from "@/features/payments/api";
import { PaymentAuditTrail } from "@/features/payments/components/payment-audit-trail";
import {
  STATUS_LABELS,
  VERDICT_LABELS,
  formatAmount,
} from "@/features/payments/lib/format";
import type { PaymentDetail } from "@/features/payments/types";

/**
 * Verdict + extracted data + confirm/reject actions + audit trail, shared by
 * the dashboard detail sheet and the inline chat card (tasks #568 PR4).
 * Confirm/reject only render while `detail.status === "ready_to_confirm"` —
 * exactly the same gate the dashboard inbox and the confirm/reject routes
 * enforce (spec's "Owner confirmation authority" requirement), so this
 * component can never offer an action the backend would reject.
 */
export function PaymentCard({
  detail,
  busy,
  onConfirm,
  onConfirmPartial,
  onReject,
}: {
  detail: PaymentDetail;
  busy: boolean;
  onConfirm: () => void;
  onConfirmPartial: () => void;
  onReject: () => void;
}) {
  const [showAudit, setShowAudit] = useState(false);
  const verdict = detail.latestProof?.verdict;
  const isPartial = detail.statusReason === "partial";
  const canAct = detail.status === "ready_to_confirm";
  const currency = detail.catalogItem?.currency ?? null;

  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {STATUS_LABELS[detail.status] ?? detail.status}
        </span>
        {verdict && (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {VERDICT_LABELS[verdict] ?? verdict}
            {isPartial && " · partial"}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="text-muted-foreground">Recibido</dt>
          <dd>{formatAmount(detail.receivedAmount, currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Restante</dt>
          <dd>{formatAmount(detail.remaining, currency)}</dd>
        </div>
        {detail.latestProof?.extracted?.reference && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Referencia</dt>
            <dd className="break-all">
              {detail.latestProof.extracted.reference}
            </dd>
          </div>
        )}
        {detail.latestProof?.extracted?.payerName && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Pagador</dt>
            <dd>{detail.latestProof.extracted.payerName}</dd>
          </div>
        )}
      </dl>

      {detail.latestProof?.hasMedia && (
        <a
          href={paymentMediaUrl(detail.id, detail.latestProof.id)}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-muted-foreground underline"
        >
          Ver comprobante
        </a>
      )}

      {canAct ? (
        <div className="flex flex-wrap gap-2">
          {isPartial ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onConfirmPartial}
            >
              Confirmar parcial
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onConfirm}
            >
              Confirmar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={onReject}
          >
            Rechazar
          </Button>
        </div>
      ) : (
        detail.confirmedAt && (
          <p className="text-xs text-muted-foreground">
            Confirmado el{" "}
            {new Date(detail.confirmedAt).toLocaleString("es-MX")}
          </p>
        )
      )}

      <button
        type="button"
        onClick={() => setShowAudit((v) => !v)}
        className="text-xs font-medium text-muted-foreground underline"
      >
        {showAudit ? "Ocultar historial" : "Ver historial de auditoría"}
      </button>
      {showAudit && <PaymentAuditTrail entries={detail.auditEntries} />}
    </div>
  );
}
