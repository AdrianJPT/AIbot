import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { SystemPrompt } from "../../prompt";
import type { AiUsage } from "../../ai/generate";
import {
  MAX_TOOL_LOOP_STEPS,
  TOOL_LOOP_CEILING_MESSAGE,
  runToolLoop,
} from "../loop";

/**
 * Unit tests for the tool-calling loop core, in isolation from
 * message-handler.ts's wiring (covered separately by
 * src/lib/__tests__/tool-loop-wiring.test.ts). `../db` is real — the loop
 * persists a real `ToolExecutionAudit` row per tool call through
 * `executeToolWithAudit` — but the OpenAI client is a hand-built fake, since
 * this suite only exercises the loop's own turn-taking logic.
 */

function systemPrompt(): SystemPrompt {
  return "system prompt" as SystemPrompt;
}

function fakeClient(...responses: unknown[]) {
  const create = vi.fn();
  for (const response of responses) create.mockResolvedValueOnce(response);
  return { client: { chat: { completions: { create } } }, create };
}

function finalAnswer(content: string, usage = fixedUsage()) {
  return { choices: [{ message: { content, tool_calls: undefined } }], usage };
}

function toolCallAnswer(
  toolCallId: string,
  args: unknown,
  usage = fixedUsage(),
) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "kernel_probe",
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
    usage,
  };
}

function fixedUsage() {
  return {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    prompt_tokens_details: { cached_tokens: 0 },
  };
}

const auditIdempotencyKeys: string[] = [];

afterAll(async () => {
  await prisma.toolExecutionAudit.deleteMany({
    where: { idempotencyKey: { in: auditIdempotencyKeys } },
  });
});

let onUsage: ReturnType<typeof vi.fn<(usage: AiUsage | null) => void>>;

beforeEach(() => {
  onUsage = vi.fn<(usage: AiUsage | null) => void>();
});

describe("runToolLoop", () => {
  it("returns the model's direct answer unchanged when it never calls a tool", async () => {
    const { client, create } = fakeClient(finalAnswer("Hola, ¿en qué ayudo?"));

    const result = await runToolLoop({
      client: client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "hola",
      idempotencyKeyPrefix: `loop-test-${crypto.randomUUID()}`,
      maxSteps: MAX_TOOL_LOOP_STEPS,
      onUsage,
    });

    expect(result).toBe("Hola, ¿en qué ayudo?");
    expect(create).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledTimes(1);
  });

  it("executes a requested tool call, feeds the result back fenced, and returns the model's follow-up answer", async () => {
    const idempotencyKeyPrefix = `loop-test-${crypto.randomUUID()}`;
    auditIdempotencyKeys.push(`${idempotencyKeyPrefix}:0:call_1`);
    const { client, create } = fakeClient(
      toolCallAnswer("call_1", { echo: "ping" }),
      finalAnswer("El resultado fue ping."),
    );

    const result = await runToolLoop({
      client: client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "probá la herramienta",
      idempotencyKeyPrefix,
      maxSteps: MAX_TOOL_LOOP_STEPS,
      onUsage,
    });

    expect(result).toBe("El resultado fue ping.");
    expect(create).toHaveBeenCalledTimes(2);

    // The tool result was persisted through the real audit boundary.
    const row = await prisma.toolExecutionAudit.findUnique({
      where: { idempotencyKey: `${idempotencyKeyPrefix}:0:call_1` },
    });
    expect(row?.toolName).toBe("kernel_probe");
    expect(row?.outcome).toBe("success");

    // The second call's messages must carry the tool result FENCED, never
    // the raw JSON — this is the untrusted-result trust boundary.
    const secondCallMessages = create.mock.calls[1][0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    const toolMessage = secondCallMessages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain(
      "RESULTADO DE HERRAMIENTA kernel_probe",
    );
    expect(toolMessage?.content).not.toBe(
      JSON.stringify({ alive: true, echo: "ping" }),
    );
  });

  it("reports usage for every actual model call, not just the final one", async () => {
    const idempotencyKeyPrefix = `loop-test-${crypto.randomUUID()}`;
    auditIdempotencyKeys.push(`${idempotencyKeyPrefix}:0:call_1`);
    const { client } = fakeClient(
      toolCallAnswer("call_1", { echo: "ping" }),
      finalAnswer("listo"),
    );

    await runToolLoop({
      client: client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "probá la herramienta",
      idempotencyKeyPrefix,
      maxSteps: MAX_TOOL_LOOP_STEPS,
      onUsage,
    });

    expect(onUsage).toHaveBeenCalledTimes(2);
  });

  it("returns the fixed ceiling fallback message, never a raw error or silence, when the model still wants a tool on the last allowed step", async () => {
    // maxSteps: 1 means there is no room for a follow-up call after a tool
    // is executed, so the loop must refuse to call the tool at all rather
    // than strand the conversation with no model call left to answer from.
    const { client, create } = fakeClient(
      toolCallAnswer("call_1", { echo: "ping" }),
    );

    const result = await runToolLoop({
      client: client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "probá la herramienta",
      idempotencyKeyPrefix: `loop-test-${crypto.randomUUID()}`,
      maxSteps: 1,
      onUsage,
    });

    expect(result).toBe(TOOL_LOOP_CEILING_MESSAGE);
    // Exactly one model call was spent — the ceiling was respected, not
    // exceeded to "sneak in" the tool call anyway.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never calls the model more than maxSteps times even across several tool-requesting turns", async () => {
    const idempotencyKeyPrefix = `loop-test-${crypto.randomUUID()}`;
    auditIdempotencyKeys.push(`${idempotencyKeyPrefix}:0:call_1`);
    // The model asks for a tool on every turn it's given — the loop must
    // still stop at maxSteps rather than looping forever.
    const { client, create } = fakeClient(
      toolCallAnswer("call_1", { echo: "ping" }),
      toolCallAnswer("call_2", { echo: "pong" }),
      toolCallAnswer("call_3", { echo: "never reached" }),
    );

    const result = await runToolLoop({
      client: client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "probá la herramienta",
      idempotencyKeyPrefix,
      maxSteps: 2,
      onUsage,
    });

    expect(result).toBe(TOOL_LOOP_CEILING_MESSAGE);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("is idempotent across two loop runs sharing the same idempotency prefix and tool-call id — the crash-retry shape", async () => {
    const idempotencyKeyPrefix = `loop-test-${crypto.randomUUID()}`;
    auditIdempotencyKeys.push(`${idempotencyKeyPrefix}:0:call_1`);
    const first = fakeClient(
      toolCallAnswer("call_1", { echo: "ping" }),
      finalAnswer("primera respuesta"),
    );
    const second = fakeClient(
      toolCallAnswer("call_1", { echo: "ping" }),
      finalAnswer("segunda respuesta"),
    );

    await runToolLoop({
      client: first.client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "probá la herramienta",
      idempotencyKeyPrefix,
      maxSteps: MAX_TOOL_LOOP_STEPS,
      onUsage,
    });
    await runToolLoop({
      client: second.client as never,
      model: "gpt-4o-mini",
      systemPrompt: systemPrompt(),
      history: [],
      userMessage: "probá la herramienta",
      idempotencyKeyPrefix,
      maxSteps: MAX_TOOL_LOOP_STEPS,
      onUsage,
    });

    // Only one ToolExecutionAudit row was ever created for this key: the
    // second run's identical (prefix, step, call id) replayed instead of
    // re-running the handler.
    const rows = await prisma.toolExecutionAudit.findMany({
      where: { idempotencyKey: `${idempotencyKeyPrefix}:0:call_1` },
    });
    expect(rows).toHaveLength(1);
  });
});
