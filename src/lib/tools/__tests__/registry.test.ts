import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolDefinition } from "../contracts";
import { ToolRegistry } from "../registry";

function buildTool<TInput, TOutput>(
  overrides: Partial<ToolDefinition<TInput, TOutput>> &
    Pick<ToolDefinition<TInput, TOutput>, "inputSchema" | "handler">,
): ToolDefinition<TInput, TOutput> {
  return {
    name: "test_tool",
    description: "A tool used only in tests.",
    ...overrides,
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

    const result = await registry.executeTool("does_not_exist", {});

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

    const result = await registry.executeTool("strict_tool", {
      count: "not-a-number",
    });

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

    const result = await registry.executeTool("add_one", { n: 41 });

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

    await expect(registry.executeTool("exploding_tool", {})).resolves.toEqual({
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

    const result = await registry.executeTool("throws_a_string", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("handler_error");
    }
  });
});
