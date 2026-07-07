"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for `/conversations` and `/conversations/[id]`. Next.js
 * renders this in place of the page whenever a server or client error
 * escapes the route (e.g. an unhandled throw in the `[id]` server
 * component) instead of showing the framework's default digest-only error
 * page.
 *
 * `reset()` re-renders the segment (retries the failed server work);
 * the "Volver a conversaciones" link is a plain navigation escape hatch
 * for when retrying keeps failing (e.g. the conversation itself is the
 * problem).
 */
export default function ConversationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort client-side log — the admin panel has no error tracker
    // wired up yet, so this at least surfaces in the browser console.
    console.error("Error en /conversations:", error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <p className="text-lg font-medium">No se pudo abrir la conversación</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocurrió un error inesperado. Podés reintentar o volver a la lista de
        conversaciones.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/conversations">Volver a conversaciones</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground">
          Código de error: {error.digest}
        </p>
      )}
    </div>
  );
}
