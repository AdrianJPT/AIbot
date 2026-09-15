/**
 * Persistence for tool executions: an append-only `ToolExecutionAudit` row
 * per call, and idempotent replay keyed on a caller-supplied deterministic
 * key. Exists because a future caller runs tools inside the message
 * pipeline, which retries — see `computeDispatchId`/`sendAndPersistReply` in
 * `message-handler.ts` for the same deterministic-id + unique-constraint
 * idiom this module follows. No tool loop and no pipeline wiring live here;
 * this is only the audit/idempotency boundary around `ToolRegistry.executeTool`.
 */
import { Prisma, type ToolExecutionAudit } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeFailureDetail } from "@/lib/channels/send-failure";
import type { ToolFailureCode, ToolResult } from "./contracts";
import type { ToolRegistry } from "./registry";
import type { ToolPipelineContext } from "./tenant-guard";

/**
 * Redacts raw tool input before it is ever persisted. Tool input can carry
 * customer-authored text (phone numbers, tokens pasted into a chat), so this
 * reuses `sanitizeFailureDetail`'s redaction rather than inventing a second
 * policy: it stringifies the input, then redacts digit runs of 7+ (phone
 * numbers, ids) and bearer/access-token-shaped substrings, collapses
 * whitespace, and truncates to a bounded length.
 */
export function sanitizeToolInput(rawInput: unknown): string | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(rawInput) ?? "null";
  } catch {
    serialized = String(rawInput);
  }
  return sanitizeFailureDetail(serialized);
}

function isIdempotencyKeyConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (Array.isArray(err.meta?.target)
      ? err.meta.target.includes("idempotencyKey")
      : // Same defensive default as message-handler.ts's isDispatchIdConflict:
        // an unconfirmable target rethrows rather than silently swallowing a
        // possibly-unrelated constraint violation.
        false)
  );
}

/** Reconstructs the `ToolResult` a prior execution produced from its audit row. */
function replayResult(row: ToolExecutionAudit): ToolResult {
  if (row.outcome === "success") {
    return { ok: true, data: row.resultData };
  }
  return {
    ok: false,
    failure: {
      code: (row.failureCode as ToolFailureCode | null) ?? "handler_error",
      message: `Replayed from a prior execution recorded under idempotency key "${row.idempotencyKey}".`,
    },
  };
}

/**
 * Runs a registered tool exactly once per `idempotencyKey` and records an
 * audit row of the attempt. Given the same key twice, the second call
 * returns the first call's result WITHOUT invoking the handler again — the
 * no-double-side-effect guarantee a retried pipeline call needs. A genuine
 * race between two concurrent callers with the same key is resolved the
 * same way `sendAndPersistReply` resolves a `dispatchId` race: the loser's
 * insert hits the unique constraint (P2002) and it replays the winner's row
 * instead of trusting its own already-computed result.
 *
 * `context` is forwarded to `registry.executeTool` unchanged — this
 * boundary has no tenant logic of its own, it only carries the reply path's
 * already-resolved `ToolPipelineContext` through to the handler.
 */
export async function executeToolWithAudit(
  registry: ToolRegistry,
  toolName: string,
  rawInput: unknown,
  idempotencyKey: string,
  context: ToolPipelineContext,
): Promise<ToolResult> {
  const existing = await prisma.toolExecutionAudit.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return replayResult(existing);
  }

  const result = await registry.executeTool(toolName, rawInput, context);
  const sanitizedInput = sanitizeToolInput(rawInput);

  try {
    await prisma.toolExecutionAudit.create({
      data: {
        toolName,
        idempotencyKey,
        sanitizedInput,
        outcome: result.ok ? "success" : "failure",
        failureCode: result.ok ? null : result.failure.code,
        ...(result.ok
          ? { resultData: result.data as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (err) {
    if (isIdempotencyKeyConflict(err)) {
      const winner = await prisma.toolExecutionAudit.findUnique({
        where: { idempotencyKey },
      });
      if (winner) {
        return replayResult(winner);
      }
    }
    throw err;
  }

  return result;
}
