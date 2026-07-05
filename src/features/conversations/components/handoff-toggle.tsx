"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function HandoffToggle({
  status,
  onChange,
  loading,
}: {
  status: string;
  onChange: (next: string) => void;
  loading: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isHuman = status === "handed_off";

  function handleToggle(checked: boolean) {
    if (checked) {
      // Turning the switch "on" pauses the bot — confirm before doing it,
      // since it stops automatic replies for this customer.
      setConfirmOpen(true);
    } else {
      onChange("active");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {isHuman ? "Atención humana" : "Bot activo"}
        </span>
        <Switch checked={isHuman} disabled={loading} onCheckedChange={handleToggle} />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Pasar esta conversación a atención humana?</DialogTitle>
            <DialogDescription>
              El bot dejará de responder automáticamente a este cliente hasta que
              vuelvas a activarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onChange("handed_off");
              }}
            >
              Pausar bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
