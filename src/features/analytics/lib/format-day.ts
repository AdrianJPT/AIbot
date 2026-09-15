/**
 * Short UTC day label for a `"YYYY-MM-DD"` bucket key, e.g. "12 sept" — used
 * by the volume and response-time panels' per-day axis. Always paired with
 * an explicit "(UTC)" caption in those panels (spec `Range Selection`:
 * "surface MUST label day boundaries as UTC").
 */
export function formatUtcDayShort(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
