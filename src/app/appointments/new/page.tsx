"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Biz = { id: string; name: string };

export default function NewAppointmentPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/businesses")
      .then((r) => r.json())
      .then(setBusinesses)
      .catch(() => setBusinesses([]));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: fd.get("businessId"),
        customerPhone: fd.get("customerPhone"),
        customerName: fd.get("customerName"),
        service: fd.get("service"),
        date: fd.get("date"),
        time: fd.get("time"),
        notes: fd.get("notes") || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Error");
      return;
    }
    router.push("/appointments");
    router.refresh();
  }

  return (
    <div>
      <Link href="/appointments" className="mb-4 inline-block text-slate-400 hover:text-white">
        ← Citas
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Nueva cita</h1>
      <form onSubmit={onSubmit} className="max-w-lg space-y-4">
        {err && (
          <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-red-200">
            {err}
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-slate-400">Negocio</label>
          <select
            name="businessId"
            required
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          >
            <option value="">—</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Teléfono cliente</label>
          <input
            name="customerPhone"
            required
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Nombre</label>
          <input
            name="customerName"
            required
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Servicio / motivo</label>
          <input
            name="service"
            required
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-slate-400">Fecha</label>
            <input
              name="date"
              required
              placeholder="2026-04-15"
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm text-slate-400">Hora</label>
            <input
              name="time"
              required
              placeholder="18:00"
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Notas</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Guardando…" : "Crear"}
        </button>
      </form>
    </div>
  );
}
