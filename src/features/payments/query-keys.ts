/**
 * Centralized TanStack Query keys for the payments feature (tasks #568
 * PR4) — mirrors src/features/conversations/query-keys.ts's shape/rationale.
 */
export const paymentKeys = {
  all: ["payments"] as const,
  detail: (id: string) => [...paymentKeys.all, id, "detail"] as const,
};
