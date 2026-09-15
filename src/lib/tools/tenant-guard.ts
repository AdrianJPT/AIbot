/**
 * The tenant boundary for tool writes. Once a tool eventually books an
 * appointment or opens a ticket, it acts on behalf of one conversation
 * belonging to one business (`ToolPipelineContext`) — and if it ever writes
 * against an entity belonging to a DIFFERENT business, that is a
 * cross-tenant data breach, the most serious class of bug this product can
 * have.
 *
 * `src/lib/scope.ts` cannot serve this: it only has `User`-shaped helpers
 * for dashboard routes, and there is no logged-in `User` inside the message
 * pipeline — only the conversation and business the pipeline already
 * resolved (see `resolveBusinessContext` in `message-handler.ts`). This is
 * that same tenant check, reshaped for the one identity actually available
 * here.
 *
 * `requireSameTenant` never throws — same boundary contract as
 * `ToolRegistry.executeTool` — and fails closed: a cross-tenant business id,
 * a missing one, and an unresolvable/ambiguous one all refuse. A caller that
 * cannot determine which business an entity belongs to (a null/undefined
 * `businessId` — whether because the entity does not exist, or because its
 * tenant could not be established) has no path to "allow": the guard does
 * not need to distinguish *why* the id is unknown, because both cases are
 * refused identically.
 */
import type { Business, Conversation } from "@prisma/client";
import type { ToolFailure } from "./contracts";

/**
 * The identity a tool call runs with: the conversation and business the
 * message pipeline already resolved before any tool was invoked. Matches
 * what `resolveBusinessContext`/`handleOneMessage` in `message-handler.ts`
 * actually have on hand — a full `Business` row and a full `Conversation`
 * row — rather than inventing a shape nothing in the pipeline produces.
 */
export type ToolPipelineContext = {
  business: Business;
  conversation: Conversation;
};

export type TenantGuardResult =
  { ok: true } | { ok: false; failure: ToolFailure };

/**
 * Verifies that a referenced entity belongs to the same business as
 * `context`. Callers pass the entity's own `businessId` column (every
 * tenant-owned model in the schema — `Conversation`, `Appointment`,
 * `CatalogItem`, ... — denormalizes one), not the entity itself, so this
 * stays reusable across every entity type a future tool touches instead of
 * being written once per model.
 *
 * Fails closed on all three refusal shapes the spec calls out:
 *  - a nullish/empty `entityBusinessId` (entity missing, or its tenant could
 *    not be resolved — treated identically, see module docstring), and
 *  - a non-empty `entityBusinessId` that names a different business.
 */
export function requireSameTenant(
  context: ToolPipelineContext,
  entityBusinessId: string | null | undefined,
): TenantGuardResult {
  if (!entityBusinessId) {
    return {
      ok: false,
      failure: {
        code: "tenant_mismatch",
        message:
          "Refused: the referenced entity has no resolvable business id.",
      },
    };
  }

  if (entityBusinessId !== context.business.id) {
    return {
      ok: false,
      failure: {
        code: "tenant_mismatch",
        message: `Refused: entity belongs to business "${entityBusinessId}", but this tool call is scoped to business "${context.business.id}".`,
      },
    };
  }

  return { ok: true };
}
