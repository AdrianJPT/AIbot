"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const [magicEmail, setMagicEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [magicError, setMagicError] = useState("");

  const [passwordMode, setPasswordMode] = useState<"signin" | "signup">(
    "signin"
  );
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<
    "idle" | "loading" | "confirm" | "error"
  >("idle");
  const [pwError, setPwError] = useState("");

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
    setMagicStatus("sending");
    setMagicError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: magicEmail,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setMagicStatus("error");
      setMagicError(error.message);
      return;
    }
    setMagicStatus("sent");
  }

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwStatus("loading");
    setPwError("");
    const supabase = createClient();

    if (passwordMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: pwEmail,
        password: pwPassword,
      });
      if (error) {
        setPwStatus("error");
        setPwError(error.message);
        return;
      }
      window.location.assign("/");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signUp({
      email: pwEmail,
      password: pwPassword,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setPwStatus("error");
      setPwError(error.message);
      return;
    }
    if (data.session) {
      window.location.assign("/");
      return;
    }
    setPwStatus("confirm");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
        <h1 className="mb-1 text-2xl font-bold">AIbot</h1>
        <p className="mb-6 text-muted-foreground">Iniciá sesión para continuar</p>

        <Button
          type="button"
          variant="secondary"
          onClick={signInWithGoogle}
          className="mb-6 w-full"
        >
          Continuar con Google
        </Button>

        <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          o con tu email
          <div className="h-px flex-1 bg-border" />
        </div>

        <Tabs defaultValue="password">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="password">Contraseña</TabsTrigger>
            <TabsTrigger value="magic">Enlace mágico</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="space-y-3">
            <div className="mb-1 flex gap-4 text-sm">
              <button
                type="button"
                onClick={() => {
                  setPasswordMode("signin");
                  setPwStatus("idle");
                  setPwError("");
                }}
                className={
                  passwordMode === "signin"
                    ? "font-medium text-foreground underline underline-offset-4"
                    : "text-muted-foreground"
                }
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordMode("signup");
                  setPwStatus("idle");
                  setPwError("");
                }}
                className={
                  passwordMode === "signup"
                    ? "font-medium text-foreground underline underline-offset-4"
                    : "text-muted-foreground"
                }
              >
                Crear cuenta
              </button>
            </div>

            {pwStatus === "confirm" ? (
              <p className="rounded border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
                Te enviamos un email a {pwEmail} para confirmar tu cuenta.
              </p>
            ) : (
              <form onSubmit={submitPassword} className="space-y-3">
                {pwStatus === "error" && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {pwError}
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="pw-email">Email</Label>
                  <Input
                    id="pw-email"
                    type="email"
                    required
                    placeholder="tu@email.com"
                    value={pwEmail}
                    onChange={(e) => setPwEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pw-password">Contraseña</Label>
                  <Input
                    id="pw-password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={pwPassword}
                    onChange={(e) => setPwPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={pwStatus === "loading"} className="w-full">
                  {pwStatus === "loading"
                    ? "Procesando…"
                    : passwordMode === "signin"
                      ? "Iniciar sesión"
                      : "Crear cuenta"}
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="magic" className="space-y-3">
            {magicStatus === "sent" ? (
              <p className="rounded border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
                Te enviamos un enlace mágico a {magicEmail}. Revisá tu bandeja
                de entrada.
              </p>
            ) : (
              <form onSubmit={sendMagicLink} className="space-y-3">
                {magicStatus === "error" && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {magicError}
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    required
                    placeholder="tu@email.com"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={magicStatus === "sending"}
                  className="w-full"
                >
                  {magicStatus === "sending" ? "Enviando…" : "Enviar enlace mágico"}
                </Button>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
