"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PaymentCardContainer } from "@/features/payments/containers/payment-card-container";

/**
 * Dashboard "detail" entry point (tasks #568 PR4, task 3 — audit-trail
 * surfacing) — reuses the exact same PaymentCardContainer as the inline chat
 * card, so the dashboard and the chat thread render the same verdict,
 * extracted data, confirm/reject actions, and audit trail from one shared
 * component, not two parallel implementations.
 */
export function PaymentDetailSheet({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={className}>
          <Eye className="h-4 w-4" /> Detalle
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalle del pago</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <PaymentCardContainer sessionId={sessionId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
