"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  business?: {
    id: string;
    name: string;
    phoneNumberId: string;
    whatsappToken: string;
    systemPrompt: string;
    welcomeMessage: string;
    businessInfo: unknown;
    model: string;
    maxHistoryMessages: number;
    isActive: boolean;
  };
};

export function BusinessForm({ business }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    let businessInfo: Record<string, string> = {};
    try {
      businessInfo = JSON.parse((fd.get("businessInfo") as string) || "{}");
    } catch {
      setError("businessInfo debe ser JSON válido");
      setLoading(false);
      return;
    }

    const payload = {
      name: fd.get("name") as string,
      phoneNumberId: fd.get("phoneNumberId") as string,
      whatsappToken: fd.get("whatsappToken") as string,
      systemPrompt: fd.get("systemPrompt") as string,
      welcomeMessage: fd.get("welcomeMessage") as string,
      businessInfo,
      model: (fd.get("model") as string) || "gpt-4o-mini",
      maxHistoryMessages: Number(fd.get("maxHistoryMessages")) || 20,
      isActive: fd.get("isActive") === "on",
    };

    try {
      const url = business ? `/api/businesses/${business.id}` : "/api/businesses";
      const res = await fetch(url, {
        method: business ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Error al guardar");
        return;
      }
      router.push("/businesses");
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  const infoStr = business
    ? JSON.stringify(business.businessInfo, null, 2)
    : `{
  "Horario": "Lun-Vie 9-18",
  "Dirección": "",
  "Teléfono": ""
}`;

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-4">
      {error && (
        <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-red-200">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm text-slate-400">Nombre</label>
        <input
          name="name"
          required
          defaultValue={business?.name}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-400">Phone Number ID (Meta)</label>
        <input
          name="phoneNumberId"
          required
          defaultValue={business?.phoneNumberId}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-400">WhatsApp token</label>
        <input
          name="whatsappToken"
          required
          type="password"
          autoComplete="off"
          defaultValue={business?.whatsappToken}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-400">Mensaje bienvenida (usa {"{businessName}"})</label>
        <input
          name="welcomeMessage"
          required
          defaultValue={business?.welcomeMessage}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-400">System prompt ({"{businessName}"}, {"{businessInfo}"})</label>
        <textarea
          name="systemPrompt"
          required
          rows={8}
          defaultValue={business?.systemPrompt}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-400">businessInfo (JSON)</label>
        <textarea
          name="businessInfo"
          required
          rows={6}
          defaultValue={infoStr}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white"
        />
      </div>
      <div className="flex gap-4">
        <div>
          <label className="mb-1 block text-sm text-slate-400">Modelo</label>
          <input
            name="model"
            defaultValue={business?.model || "gpt-4o-mini"}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Max historial</label>
          <input
            name="maxHistoryMessages"
            type="number"
            min={1}
            max={100}
            defaultValue={business?.maxHistoryMessages ?? 20}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-slate-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={business?.isActive !== false}
        />
        Activo
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {loading ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
