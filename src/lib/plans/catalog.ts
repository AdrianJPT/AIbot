/**
 * Commercial plan catalogue — code constants, not DB rows (design #1432,
 * "Plan catalogue" decision). `PhoneNumber.planCode` discriminates which of
 * these applies; a null `planCode` means no entitlement is assigned yet.
 *
 * Content sourced from `docs/negocio/precios/tarifario.md`, the commercial
 * source of truth. `src/lib/plans/__tests__/catalog.test.ts` asserts these
 * numbers against that document verbatim so a silent drift between code and
 * the tariff fails the suite instead of shipping unnoticed.
 */
export const PLAN_CODES = ["starter", "basic", "pro", "premium"] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

export type PlanAllowance = {
  /** Approximate billable chats/month included in the plan (tariff column "Chats/mes aprox."). */
  chatAllowance: number;
  /** AI-generated replies included per billing cycle (tariff column "Respuestas IA de servicio incluidas"). */
  replyAllowance: number;
  /** Final tax-inclusive monthly price in Peruvian soles (tariff column "Precio final con IGV"). */
  priceSolesIncTax: number;
};

export const PLAN_CATALOG: Record<PlanCode, PlanAllowance> = {
  starter: { chatAllowance: 150, replyAllowance: 900, priceSolesIncTax: 149 },
  basic: { chatAllowance: 300, replyAllowance: 1800, priceSolesIncTax: 379 },
  pro: { chatAllowance: 500, replyAllowance: 3000, priceSolesIncTax: 749 },
  premium: {
    chatAllowance: 1500,
    replyAllowance: 9000,
    priceSolesIncTax: 2499,
  },
};
