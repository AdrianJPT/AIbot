/**
 * Registry for callable tools: register a `ToolDefinition` by name, look it
 * up, and execute it through the validate-then-invoke contract.
 * `executeTool` never throws — an unknown name, a schema-validation
 * failure, or a handler that throws all become a typed `ToolResult`
 * failure, because a future caller lives inside the message pipeline where
 * an unhandled throw would break delivery. A handler's `ToolRefusalError`
 * is recognized specially and carries its own failure code through instead
 * of collapsing into the generic `handler_error` every other throw gets.
 */
import {
  ToolRefusalError,
  type ToolDefinition,
  type ToolResult,
} from "./contracts";
import type { ToolPipelineContext } from "./tenant-guard";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  /** Registers a tool by name, replacing any prior registration under that name. */
  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    // Type-erased on storage: the registry holds tools of many different
    // input/output shapes, and `executeTool` validates raw input with the
    // tool's own schema before its handler ever sees it, so this boundary
    // cast is safe despite losing the specific TInput/TOutput here.
    this.tools.set(
      tool.name,
      tool as unknown as ToolDefinition<unknown, unknown>,
    );
  }

  /** Looks up a registered tool by name, or `undefined` if none is registered. */
  getTool(name: string): ToolDefinition<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  /**
   * Validates `rawInput` against the named tool's schema BEFORE calling its
   * handler, then runs the handler (passing `context` through as its second
   * argument) and reports its outcome. An unknown name, a validation
   * failure, and a thrown handler error all resolve to `{ ok: false }`
   * instead of throwing. A thrown `ToolRefusalError` resolves to its own
   * carried `{ code, message }` rather than the generic `handler_error`.
   */
  async executeTool(
    name: string,
    rawInput: unknown,
    context: ToolPipelineContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        failure: {
          code: "unknown_tool",
          message: `No tool is registered with the name "${name}".`,
        },
      };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        failure: {
          code: "invalid_input",
          message: parsed.error.issues.map((issue) => issue.message).join("; "),
        },
      };
    }

    try {
      const data = await tool.handler(parsed.data, context);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof ToolRefusalError) {
        return { ok: false, failure: { code: err.code, message: err.message } };
      }
      return {
        ok: false,
        failure: {
          code: "handler_error",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
