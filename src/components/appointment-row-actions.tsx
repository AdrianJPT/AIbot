"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppointmentRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function patch(status: string) {
    setLoading(true);
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    router.refresh();
  }

  async function del() {
    if (!confirm("¿Eliminar cita?")) return;
    setLoading(true);
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={() => patch("confirmed")}
        className="rounded bg-emerald-800 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Confirmar
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => patch("cancelled")}
        className="rounded bg-amber-900 px-2 py-1 text-xs text-white hover:bg-amber-800 disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={del}
        className="rounded bg-red-900 px-2 py-1 text-xs text-white hover:bg-red-800 disabled:opacity-50"
      >
        Borrar
      </button>
    </div>
  );
}
