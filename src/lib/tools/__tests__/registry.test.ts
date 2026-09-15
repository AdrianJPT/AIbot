import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildBusiness } from "@/lib/__tests__/fixtures/business";
import type { Conversation } from "@prisma/client";
import { ToolRefusalError, type ToolDefinition } from "../contracts";
import { ToolRegistry } from "../registry";
import type { ToolPipelineContext } from "../tenant-guard";

function buildTool<TInput, TOutput>(
  overrides: Partial<ToolDefinition<TInput, TOutput>> &
    Pick<ToolDefinition<TInput, TOutput>, "inputSchema" | "handler">,
): ToolDefinition<TInput, TOutput> {
  return {
    name: "test_tool",
    description: "A tool used only in tests.",
    mutating: false,
    ...overrides,
  };
}

/**
 * A minimal `ToolPipelineContext` for tests in this file: these tests exercise
 * the registry's own dispatch/refusal machinery, not tenant matching itself
 * (that's `tenant-guard.test.ts`, which needs real `Business`/`Conversation`
 * rows), so a fixture business plus a cast conversation stub is enough.
 */
function buildToolContext(): ToolPipelineContext {
  return {
    business: buildBusiness(),
    conversation: { id: "conv_1", businessId: "biz_1" } as Conversation,
  };
}

describe("ToolRegistry", () => {
  it("looks up a registered tool by name", () => {
    const registry = new ToolRegistry();
    const tool = buildTool({
      inputSchema: z.object({}),
      handler: () => "ok",
    });

    registry.register(tool);

    expect(registry.getTool("test_tool")).toBe(tool);
  });

  it("returns undefined for a name nothing was registered under", () => {
    const registry = new ToolRegistry();

    expect(registry.getTool("does_not_exist")).toBeUndefined();
  });

  it("executeTool resolves an unknown tool name to a typed failure instead of throwing", async () => {
    const registry = new ToolRegistry();

    const result = await registry.executeTool(
      "does_not_exist",
      {},
      buildToolContext(),
    );

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "unknown_tool",
        message: expect.stringContaining("does_not_exist"),
      },
    });
  });

  it("never calls the handler when raw input fails schema validation", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(() => "should not run");
    registry.register(
      buildTool({
        name: "strict_tool",
        inputSchema: z.object({ count: z.number() }),
        handler,
      }),
    );

    const result = await registry.executeTool(
      "strict_tool",
      { count: "not-a-number" },
      buildToolContext(),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_input");
    }
  });

  it("returns a success envelope carrying the handler's data on valid input", async () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        name: "add_one",
        inputSchema: z.object({ n: z.number() }),
        handler: (input: { n: number }) => input.n + 1,
      }),
    );

    const result = await registry.executeTool(
      "add_one",
      { n: 41 },
      buildToolContext(),
    );

    expect(result).toEqual({ ok: true, data: 42 });
  });

  it("turns a thrown handler error into a typed failure envelope, never an escaping exception", async () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        name: "exploding_tool",
        inputSchema: z.object({}),
        handler: () => {
          throw new Error("boom");
        },
      }),
    );

    await expect(
      registry.executeTool("exploding_tool", {}, buildToolContext()),
    ).resolves.toEqual({
      ok: false,
      failure: { code: "handler_error", message: "boom" },
    });
  });

  it("turns a thrown non-Error handler value into a typed failure envelope too", async () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        name: "throws_a_string",
        inputSchema: z.object({}),
        handler: () => {
          // Proving a non-`Error` throw is still caught and reported.
          throw "not an Error instance";
        },
      }),
    );

    const result = await registry.executeTool(
      "throws_a_string",
      {},
      buildToolContext(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("handler_error");
    }
  });

  it("maps a thrown ToolRefusalError to its own typed failure code, not handler_error", async () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        name: "refusing_tool",
        inputSchema: z.object({}),
        handler: () => {
          throw new ToolRefusalError("tenant_mismatch", "x");
        },
      }),
    );

    const result = await registry.executeTool(
      "refusing_tool",
      {},
      buildToolContext(),
    );

    expect(result).toEqual({
      ok: false,
      failure: { code: "tenant_mismatch", message: "x" },
    });
  });

  it("passes the context given to executeTool through to the handler as its second argument", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(() => "ok");
    registry.register(
      buildTool({
        name: "context_aware_tool",
        inputSchema: z.object({}),
        handler,
      }),
    );
    const context = buildToolContext();

    await registry.executeTool("context_aware_tool", {}, context);

    expect(handler).toHaveBeenCalledWith({}, context);
  });
});
