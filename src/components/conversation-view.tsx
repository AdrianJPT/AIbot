"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Msg = {
  id: string;
  role: string;
  content: string;
  mediaType: string;
  createdAt: string;
};

type Conv = {
  id: string;
  customerPhone: string;
  status: string;
  business: { name: string };
  messages: Msg[];
};

export function ConversationView({ initial }: { initial: Conv }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function setHandoff(next: string) {
    setLoading(true);
    setErr("");
    const res = await fetch(`/api/conversations/${initial.id}/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (!res.ok) {
      setErr("No se pudo actualizar el estado");
      return;
    }
    setStatus(next);
    router.refresh();
  }

  async function sendManual() {
    if (!text.trim()) return;
    setLoading(true);
    setErr("");
    const res = await fetch(`/api/conversations/${initial.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      setErr("No se pudo enviar");
      return;
    }
    setText("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-slate-400">Estado:</span>
        <span className="rounded bg-slate-800 px-2 py-1 font-mono text-sm">{status}</span>
        {status === "active" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => setHandoff("handed_off")}
            className="rounded bg-amber-700 px-3 py-1 text-sm text-white hover:bg-amber-600 disabled:opacity-50"
          >
            Pasar a humano
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => setHandoff("active")}
            className="rounded bg-emerald-700 px-3 py-1 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Devolver al bot
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => setHandoff("closed")}
          className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
        >
          Cerrar
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        {initial.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-8 bg-slate-800 text-slate-100"
                : "mr-8 bg-emerald-950/50 text-emerald-100"
            }`}
          >
            <div className="text-xs text-slate-500">
              {m.role} · {m.mediaType} · {new Date(m.createdAt).toLocaleString()}
            </div>
            <div className="mt-1 whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensaje manual (WhatsApp)…"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
        <button
          type="button"
          disabled={loading}
          onClick={sendManual}
          className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
