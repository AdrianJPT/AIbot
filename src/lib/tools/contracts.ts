/**
 * Callable-tool substrate: the shape every tool must have and the result
 * envelope every tool call returns. This is only the kernel's data model —
 * `registry.ts` owns lookup and validate-then-invoke execution, and
 * `kernel-probe.ts` is the one diagnostic tool that proves the path. No
 * tool loop, no reply-path wiring, no product tools live here.
 */
import type { z } from "zod";

/**
 * Every classified reason a tool call can fail, modeled on
 * `SendFailureCode` in `src/lib/channels/send-failure.ts`.
 */
export const TOOL_FAILURE_CODES = [
  "unknown_tool",
  "invalid_input",
  "handler_error",
  "tenant_mismatch",
] as const;

export type ToolFailureCode = (typeof TOOL_FAILURE_CODES)[number];

/** A classified tool failure: a stable code plus a human-readable message. */
export type ToolFailure = {
  code: ToolFailureCode;
  message: string;
};

/**
 * The result of a tool call. This boundary never throws — an unknown tool
 * name, a schema-validation failure, and a thrown handler error all
 * resolve to `{ ok: false }` (see `ToolRegistry.executeTool` in
 * `registry.ts`) rather than propagating an exception.
 */
export type ToolResult<TOutput = unknown> =
  { ok: true; data: TOutput } | { ok: false; failure: ToolFailure };

/**
 * One callable tool: a name to look it up by, a human description (for a
 * future model's tool listing), the Zod schema its raw input is validated
 * against before the handler ever runs, and the handler itself.
 *
 * `mutating` is a required, explicit declaration — not an optional flag
 * defaulting to `false` — so a new tool can never slip through by omission.
 * A tool that writes against tenant-owned data (books an appointment, opens
 * a ticket, anything past a lookup) MUST set `mutating: true` and call
 * `requireSameTenant` (`./tenant-guard.ts`) on every entity it writes to
 * before the write happens. This is enforced structurally, not just by
 * convention — see `__tests__/mutating-tool-guard-wiring.test.ts`, which
 * fails the build if a tool source file declares `mutating: true` without a
 * `requireSameTenant(` call in the same file.
 */
export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  mutating: boolean;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput) => Promise<TOutput> | TOutput;
};
