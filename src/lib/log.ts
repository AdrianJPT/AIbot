import { prisma } from "./db";

export type LogLevel = "error" | "warn" | "info";

/**
 * Persists an event to the EventLog table and mirrors it to stdout/stderr
 * (Railway captures console output). Never throws — observability must not
 * be able to take down the caller.
 */
export async function logEvent(
  level: LogLevel,
  source: string,
  message: string,
  detail?: unknown,
  businessId?: string
): Promise<void> {
  try {
    if (level === "error") {
      console.error(`[${source}] ${message}`, detail ?? "");
    } else if (level === "warn") {
      console.warn(`[${source}] ${message}`, detail ?? "");
    } else {
      console.log(`[${source}] ${message}`, detail ?? "");
    }

    const safeDetail =
      detail instanceof Error
        ? { message: detail.message, stack: detail.stack }
        : detail;

    await prisma.eventLog.create({
      data: {
        level,
        source,
        message,
        detail: safeDetail === undefined ? undefined : (safeDetail as object),
        businessId,
      },
    });
  } catch (err) {
    console.error("[log] failed to persist EventLog", err);
  }
}
