import type { AppConfig, Business } from "@prisma/client";

/**
 * Whether tool-calling is effectively enabled for this business: the
 * platform-wide `AppConfig.toolsEnabled` kill switch AND the per-tenant
 * `Business.toolsEnabled` opt-in both have to be on. The platform switch is
 * an override, not a default — a business that opted in gets nothing if the
 * platform switch is off, and a missing AppConfig row (no admin config
 * written yet) is treated the same as "platform switch off".
 */
export function toolsEffectivelyEnabled(
  appConfig: AppConfig | null,
  business: Business,
): boolean {
  return Boolean(appConfig?.toolsEnabled) && business.toolsEnabled;
}
