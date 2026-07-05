"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function signInWithGoogle() {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/80 p-8">
        <h1 className="mb-1 text-2xl font-bold text-white">WhatsApp AI</h1>
        <p className="mb-6 text-slate-400">Iniciá sesión para continuar</p>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="mb-6 w-full rounded bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
        >
          Continuar con Google
        </button>

        <div className="mb-6 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          o con tu email
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {status === "sent" ? (
          <p className="rounded border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
            Te enviamos un enlace mágico a {email}. Revisá tu bandeja de
            entrada.
          </p>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-3">
            {status === "error" && (
              <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <input
              type="email"
              required
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {status === "sending" ? "Enviando…" : "Enviar enlace mágico"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
