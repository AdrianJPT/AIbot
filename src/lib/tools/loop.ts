/**
 * The tool-calling loop: the one piece of the kernel that runs inside live
 * message delivery. Everything else under `src/lib/tools/` (registry, audit,
 * enabled, untrusted-result, tenant-guard, kernel-probe) is inert until this
 * wires it up. The only caller is `resolveAiReply` in `../message-handler`,
 * which decides WHETHER to call this (both tools flags on, resolved provider
 * on the allow-list) — this module owns the loop's own turn-taking once that
 * decision is already made.
 *
 * Only `kernelProbeTool` is registered here. No product tools: this unit
 * proves the loop works, it does not give the bot new abilities.
 */
import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { SystemPrompt } from "../prompt";
import type { AiUsage } from "../ai/generate";
import { ToolRegistry } from "./registry";
import { executeToolWithAudit } from "./audit";
import { renderToolResultBlock } from "./untrusted-result";
import { kernelProbeTool } from "./kernel-probe";
import type { ToolPipelineContext } from "./tenant-guard";

/**
 * Only `openai` may run a tools-bearing request. `resolveAiReply` reads
 * this to decide, per `callWithAiCredential(business, (client, provider) =>
 * ...)` attempt, whether the resolved candidate is safe to hand tools to —
 * an unvetted provider (a custom `baseUrl`, a proxy with unknown tool-call
 * semantics) never sees a `tools` array, full stop.
 */
export const TOOL_LOOP_ALLOWED_PROVIDER = "openai";

/**
 * Hard ceiling on model calls within ONE tool loop, independent of the
 * per-business daily budget (see `resolveAiReply`, which additionally caps
 * this by the remaining daily allowance — this constant is the floor under
 * that, not a replacement for it).
 *
 * Sized jointly against two risks:
 *  - Spend: `Business.dailyAiLimit` counts *replies*, not model calls (see
 *    `ai-usage-counter-parity.test.ts`), so a tool loop is the one place a
 *    single counted reply can multiply into several actual provider calls.
 *    A small fixed ceiling keeps that multiplication bounded regardless of
 *    how generous a business's daily limit is.
 *  - The reply-window flush lease: `FLUSH_LEASE_MS` in
 *    `../reply-window-scheduler.ts` is sized for exactly ONE AI call (60s,
 *    documented there as 2x headroom over a ~30s worst-case credential-chain
 *    failover for that one call). This loop runs INSIDE that same lease, so
 *    its total worst-case wall time — `MAX_TOOL_LOOP_STEPS *
 *    TOOL_LOOP_STEP_TIMEOUT_MS` — is kept at or under that original ~30s
 *    single-call budget (2 * 15s = 30s) rather than silently multiplying it.
 *    A whole-loop failure still gets ONE retry/failover cycle from
 *    `callWithAiCredential` (it wraps the entire loop as its `fn`), which is
 *    within the existing 2x headroom the lease already budgets for.
 *
 * 2 steps is also exactly enough for a single-tool-call turn: one round trip
 * to call a tool, one more to synthesize the answer.
 */
export const MAX_TOOL_LOOP_STEPS = 2;

/**
 * Per-call timeout for a tool-loop step, deliberately tighter than the
 * ordinary single-shot path's client-level 20s (`buildClientForCredential`
 * in `../ai/resolve.ts`) — see `MAX_TOOL_LOOP_STEPS`'s docstring for why
 * `MAX_TOOL_LOOP_STEPS * TOOL_LOOP_STEP_TIMEOUT_MS` must stay near that
 * single-call budget instead of multiplying it. A slow provider fails a
 * tool-loop step fast, matching this codebase's existing "fail fast so a
 * fallback chain can move on" philosophy.
 */
export const TOOL_LOOP_STEP_TIMEOUT_MS = 15_000;

/**
 * Sent to the customer when the loop is stopped by `MAX_TOOL_LOOP_STEPS` (or
 * by a caller-supplied `maxSteps` derived from the remaining daily budget)
 * while the model still wants to call a tool. Never silence, never a raw
 * error — this exact string matches the repo's system-fallback voice (see
 * `DAILY_LIMIT_MESSAGE` in `../message-handler.ts`).
 */
export const TOOL_LOOP_CEILING_MESSAGE =
  "Alcanzamos el límite de respuestas disponibles por ahora. Cuéntanos en pocas palabras qué necesitas y te respondemos apenas se renueve.";

/**
 * The one tool this kernel exposes right now. A future tool adds its own
 * registration + JSON-schema declaration here; `ToolDefinition` (contracts.ts)
 * intentionally carries no JSON Schema of its own, so this is the seam.
 */
const toolLoopRegistry = new ToolRegistry();
toolLoopRegistry.register(kernelProbeTool);

const TOOL_DECLARATIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: kernelProbeTool.name,
      description: kernelProbeTool.description,
      parameters: {
        type: "object",
        properties: {
          echo: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["echo"],
        additionalProperties: false,
      },
    },
  },
];

function toAiUsage(
  usage: OpenAI.CompletionUsage | undefined | null,
): AiUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

/** Malformed tool-call arguments resolve to `{}` — the registry's own schema
 * validation then reports a normal `invalid_input` failure, fenced back to
 * the model like any other tool failure, rather than the loop throwing. */
function parseToolArguments(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export type RunToolLoopOptions = {
  client: OpenAI;
  model: string;
  systemPrompt: SystemPrompt;
  history: ChatCompletionMessageParam[];
  userMessage: string;
  /**
   * Prefixes every tool call's idempotency key. Callers pass the same
   * deterministic id a retried attempt would recompute — `dispatchId`
   * (`computeDispatchId` in `../message-handler.ts`) for the real reply
   * path — so a crash-and-retry that reaches the same tool call again
   * replays its audited result instead of re-running the handler.
   */
  idempotencyKeyPrefix: string;
  /** Hard cap on model calls this loop may make — see `MAX_TOOL_LOOP_STEPS`. */
  maxSteps: number;
  /**
   * Invoked once per ACTUAL model call (not once per reply), so spend stays
   * visible: a caller that logs one `EventLog` row per usage report gets one
   * row per real provider call, not one per customer-facing reply.
   */
  onUsage: (usage: AiUsage | null) => Promise<void> | void;
  /**
   * The tenant identity every tool call in this loop runs with. Supplied by
   * the reply path (`resolveAiReply` in `../message-handler.ts`), which
   * already resolved the business and conversation before the loop ever
   * started — NEVER derived from model input, since the model's tool-call
   * arguments are untrusted.
   */
  context: ToolPipelineContext;
};

/**
 * Runs the tool-calling loop and returns the customer-facing reply text.
 * Never throws for an in-band tool failure (that is `ToolRegistry`'s own
 * contract via `executeToolWithAudit`) and never returns silence: the model's
 * final answer, or `TOOL_LOOP_CEILING_MESSAGE` if `maxSteps` is exhausted
 * while the model still wants to call a tool.
 */
export async function runToolLoop(opts: RunToolLoopOptions): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.history,
    { role: "user", content: opts.userMessage },
  ];

  for (let step = 0; step < opts.maxSteps; step++) {
    const response = await opts.client.chat.completions.create(
      {
        model: opts.model,
        messages,
        max_tokens: 500,
        tools: TOOL_DECLARATIONS,
      },
      { timeout: TOOL_LOOP_STEP_TIMEOUT_MS },
    );
    await opts.onUsage(toAiUsage(response.usage));

    const choice = response.choices[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return (
        choice?.content?.trim() || "Lo siento, no pude generar una respuesta."
      );
    }

    // The model wants to call a tool, but this is the last step it's
    // allowed: executing the call would leave no model call left to
    // synthesize an answer from the result. Stop here instead of stranding
    // the customer with a tool result nobody ever reads.
    if (step === opts.maxSteps - 1) {
      return TOOL_LOOP_CEILING_MESSAGE;
    }

    messages.push({
      role: "assistant",
      content: choice?.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const rawInput = parseToolArguments(call.function.arguments);
      const result = await executeToolWithAudit(
        toolLoopRegistry,
        call.function.name,
        rawInput,
        `${opts.idempotencyKeyPrefix}:${step}:${call.id}`,
        opts.context,
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: renderToolResultBlock(call.function.name, result),
      });
    }
  }

  // Unreachable: maxSteps >= 1 is enforced by the caller, and the loop
  // always returns on its last iteration (either a direct answer or the
  // ceiling message above). Kept for exhaustiveness/type-safety only.
  return TOOL_LOOP_CEILING_MESSAGE;
}
