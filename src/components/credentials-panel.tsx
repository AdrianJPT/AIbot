"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Credential = {
  id: string;
  kind: string;
  provider: string;
  label: string;
  keyLast4: string;
  baseUrl: string | null;
  status: string;
  lastUsedAt: string | Date | null;
  lastError: string | null;
  createdAt: string | Date;
};

const AI_PROVIDERS = ["openai", "openrouter", "google"];

function statusBadgeClass(status: string): string {
  if (status === "active") return "bg-emerald-900/60 text-emerald-300";
  if (status === "revoked") return "bg-red-900/60 text-red-300";
  return "bg-slate-800 text-slate-300";
}

function statusLabel(status: string): string {
  if (status === "active") return "Activa";
  if (status === "revoked") return "Revocada";
  return "En espera";
}

export function CredentialsPanel({
  initialCredentials,
}: {
  initialCredentials: Credential[];
}) {
  const router = useRouter();
  const [credentials, setCredentials] = useState(initialCredentials);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const [kind, setKind] = useState<"ai" | "whatsapp">("ai");
  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          provider: kind === "whatsapp" ? "meta" : provider,
          label,
          key,
          baseUrl: baseUrl || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Error al guardar");
        return;
      }
      setCredentials((prev) => [body, ...prev]);
      setLabel("");
      setKey("");
      setBaseUrl("");
      refresh();
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function onAction(id: string, action: "activate" | "revoke") {
    setError("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/credentials/${id}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Error");
        return;
      }
      refresh();
      const list = await fetch("/api/credentials").then((r) => r.json());
      setCredentials(list);
    } catch {
      setError("Error de red");
    } finally {
      setBusyId(null);
    }
  }

  async function onTest(cred: Credential) {
    setError("");
    setBusyId(cred.id);
    try {
      const res = await fetch(`/api/credentials/${cred.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          cred.kind === "whatsapp"
            ? { phoneNumberId: phoneNumberId[cred.id] }
            : {}
        ),
      });
      const body = await res.json();
      setTestResult((prev) => ({
        ...prev,
        [cred.id]: body.ok ? "OK" : body.error || "Falló",
      }));
      refresh();
    } catch {
      setTestResult((prev) => ({ ...prev, [cred.id]: "Error de red" }));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setError("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Error");
        return;
      }
      setCredentials((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Error de red");
    } finally {
      setBusyId(null);
    }
  }

  const groups: Array<{ kind: string; title: string }> = [
    { kind: "ai", title: "IA" },
    { kind: "whatsapp", title: "WhatsApp" },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-red-200">
          {error}
        </div>
      )}

      {groups.map((g) => {
        const rows = credentials.filter((c) => c.kind === g.kind);
        return (
          <div key={g.kind}>
            <h2 className="mb-2 text-lg font-semibold text-white">{g.title}</h2>
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Clave</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Último uso</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t border-slate-800 align-top">
                      <td className="px-4 py-3 text-white">{c.label}</td>
                      <td className="px-4 py-3 text-slate-400">{c.provider}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        •••• {c.keyLast4}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-1 text-xs ${statusBadgeClass(c.status)}`}
                        >
                          {statusLabel(c.status)}
                        </span>
                        {c.lastError && (
                          <p className="mt-1 max-w-xs text-xs text-red-400" title={c.lastError}>
                            {c.lastError}
                          </p>
                        )}
                        {testResult[c.id] && (
                          <p className="mt-1 text-xs text-slate-400">{testResult[c.id]}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {c.lastUsedAt
                          ? new Date(c.lastUsedAt).toLocaleString("es-AR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {c.kind === "whatsapp" && (
                            <input
                              placeholder="phone_number_id"
                              value={phoneNumberId[c.id] || ""}
                              onChange={(e) =>
                                setPhoneNumberId((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                            />
                          )}
                          <button
                            disabled={busyId === c.id || c.status === "revoked"}
                            onClick={() => onTest(c)}
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                          >
                            Probar
                          </button>
                          <button
                            disabled={busyId === c.id || c.status !== "standby"}
                            onClick={() => onAction(c.id, "activate")}
                            className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            Activar
                          </button>
                          <button
                            disabled={busyId === c.id || c.status === "revoked"}
                            onClick={() => onAction(c.id, "revoke")}
                            className="rounded bg-amber-800 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            Revocar
                          </button>
                          <button
                            disabled={busyId === c.id || c.status !== "revoked"}
                            onClick={() => onDelete(c.id)}
                            className="rounded bg-red-800 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="p-6 text-slate-500">No hay credenciales de este tipo.</p>
              )}
            </div>
          </div>
        );
      })}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-white">Agregar credencial</h2>
        <form onSubmit={onAdd} className="max-w-xl space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "ai" | "whatsapp")}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            >
              <option value="ai">IA</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          {kind === "ai" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Proveedor</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-slate-400">Label</label>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Clave / token</label>
            <input
              required
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </div>
          {kind === "ai" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">
                Base URL (opcional)
              </label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="usa el default del proveedor si se deja vacío"
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Agregar credencial"}
          </button>
        </form>
      </div>
    </div>
  );
}
