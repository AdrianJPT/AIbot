"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const MIN_SECONDS = 0;
const MAX_SECONDS = 300;

function clampSeconds(seconds: number): number {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds));
}

/**
 * Dedicated settings surface for the reply debounce delay
 * (`Business.replyWindowMs`, form field `replyWindowSeconds`): how long the
 * bot waits after the customer's last message before replying, so a burst of
 * consecutive messages gets batched into one response.
 *
 * Unrelated to WhatsApp's 24h customer-service window — see
 * `customer-service-window.ts` / `CustomerServiceWindowBanner` for that
 * separate, informational-only concept. This card never references it.
 */
export function ReplyDebounceCard({
  replyWindowMs,
}: {
  replyWindowMs: number;
}) {
  const initialSeconds = clampSeconds(Math.round(replyWindowMs / 1000));
  const [seconds, setSeconds] = useState(initialSeconds);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Demora antes de responder
        </CardTitle>
        <CardDescription>
          Si el cliente manda varios mensajes seguidos, esperamos este tiempo
          desde el último para juntarlos en una sola respuesta. Usá 0 para
          responder al instante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="replyWindowSeconds">Segundos de espera</Label>
          <output
            htmlFor="replyWindowSeconds"
            className="font-mono text-sm font-semibold text-primary"
          >
            {seconds} s
          </output>
        </div>
        <input
          id="replyWindowSeconds"
          name="replyWindowSeconds"
          type="range"
          min={MIN_SECONDS}
          max={MAX_SECONDS}
          step={1}
          defaultValue={initialSeconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
          className="w-full"
        />
      </CardContent>
    </Card>
  );
}
