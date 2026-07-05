/** Formatting helpers for the chat UI (list items, thread bubbles, banners). */

export function initialsFrom(name: string | null | undefined, phone: string): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
    if (letters.length) return letters.join("");
  }
  return phone.slice(-2);
}

export function relativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "ahora";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} h`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay === 1) return "ayer";
  if (diffDay < 7) return `${diffDay} d`;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
}

/** "Hoy" / "Ayer" / localized date, for thread date separators. */
export function dateSeparatorLabel(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return "Hoy";
  if (isSameDay(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when the last customer message is older than WhatsApp's 24h window. */
export function isOutsideWhatsAppWindow(lastCustomerMessageAt: string | Date | null): boolean {
  if (!lastCustomerMessageAt) return false;
  const d =
    typeof lastCustomerMessageAt === "string"
      ? new Date(lastCustomerMessageAt)
      : lastCustomerMessageAt;
  return Date.now() - d.getTime() > WHATSAPP_WINDOW_MS;
}

export const MEDIA_ICON: Record<string, string> = {
  image: "🖼",
  audio: "🎙",
  location: "📍",
  document: "📄",
};
