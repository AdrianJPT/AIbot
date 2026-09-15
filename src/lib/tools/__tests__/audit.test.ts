import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildBusiness } from "@/lib/__tests__/fixtures/business";
import type { Conversation } from "@prisma/client";
import { ToolRefusalError, type ToolDefinition } from "../contracts";
import { ToolRegistry } from "../registry";
import { executeToolWithAudit, sanitizeToolInput } from "../audit";
import type { ToolPipelineContext } from "../tenant-guard";

const createdIds: string[] = [];

async function findAuditRow(idempotencyKey: string) {
  return prisma.toolExecutionAudit.findUnique({ where: { idempotencyKey } });
}

/**
 * Same minimal-fixture approach as `registry.test.ts`'s `buildToolContext`:
 * these tests exercise the audit/idempotency boundary, not tenant matching,
 * so a fixture business plus a cast conversation stub is enough.
 */
function buildToolContext(): ToolPipelineContext {
  return {
    business: buildBusiness(),
    conversation: { id: "conv_1", businessId: "biz_1" } as Conversation,
  };
}

describe("executeToolWithAudit", () => {
  afterAll(async () => {
    await prisma.toolExecutionAudit.deleteMany({
      where: { id: { in: createdIds } },
    });
  });

  it("runs the handler and persists a success audit row on the first call", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(() => ({ alive: true }));
    const tool: ToolDefinition<Record<string, never>, { alive: boolean }> = {
      name: "probe_tool",
      description: "test tool",
      mutating: false,
      inputSchema: z.object({}),
      handler,
    };
    registry.register(tool);
    const idempotencyKey = `audit-success-${crypto.randomUUID()}`;

    const result = await executeToolWithAudit(
      registry,
      "probe_tool",
      {},
      idempotencyKey,
      buildToolContext(),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: { alive: true } });

    const row = await findAuditRow(idempotencyKey);
    expect(row).not.toBeNull();
    if (row) createdIds.push(row.id);
    expect(row?.toolName).toBe("probe_tool");
    expect(row?.outcome).toBe("success");
    expect(row?.failureCode).toBeNull();
  });

  it("persists a failure audit row with the envelope's failure code, and never a message", async () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition<{ count: number }, never> = {
      name: "strict_tool",
      description: "test tool",
      mutating: false,
      inputSchema: z.object({ count: z.number() }),
      handler: () => {
        throw new Error("should not run for invalid input");
      },
    };
    registry.register(tool);
    const idempotencyKey = `audit-failure-${crypto.randomUUID()}`;

    const result = await executeToolWithAudit(
      registry,
      "strict_tool",
      { count: "not a number" },
      idempotencyKey,
      buildToolContext(),
    );

    expect(result.ok).toBe(false);

    const row = await findAuditRow(idempotencyKey);
    expect(row).not.toBeNull();
    if (row) createdIds.push(row.id);
    expect(row?.outcome).toBe("failure");
    expect(row?.failureCode).toBe("invalid_input");
  });

  it("replays the first result on a repeated idempotency key WITHOUT re-running the handler", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(() => ({ echo: "hello" }));
    const tool: ToolDefinition<Record<string, never>, { echo: string }> = {
      name: "echo_tool",
      description: "test tool",
      mutating: false,
      inputSchema: z.object({}),
      handler,
    };
    registry.register(tool);
    const idempotencyKey = `audit-idempotent-${crypto.randomUUID()}`;

    const context = buildToolContext();
    const first = await executeToolWithAudit(
      registry,
      "echo_tool",
      {},
      idempotencyKey,
      context,
    );
    const second = await executeToolWithAudit(
      registry,
      "echo_tool",
      {},
      idempotencyKey,
      context,
    );

    // The critical assertion: the handler ran exactly once across BOTH
    // invocations, not merely that both calls returned equal values.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    const row = await findAuditRow(idempotencyKey);
    if (row) createdIds.push(row.id);
  });

  it("forwards the given context through to the registry's executeTool", async () => {
    const registry = new ToolRegistry();
    const executeToolSpy = vi.spyOn(registry, "executeTool");
    registry.register({
      name: "noop_tool",
      description: "test tool",
      mutating: false,
      inputSchema: z.object({}),
      handler: () => ({ alive: true }),
    });
    const context = buildToolContext();
    const idempotencyKey = `audit-context-${crypto.randomUUID()}`;

    const result = await executeToolWithAudit(
      registry,
      "noop_tool",
      {},
      idempotencyKey,
      context,
    );

    expect(executeToolSpy).toHaveBeenCalledWith("noop_tool", {}, context);

    const row = await findAuditRow(idempotencyKey);
    expect(row).not.toBeNull();
    if (row) createdIds.push(row.id);
    expect(result.ok).toBe(true);
  });

  it("audits a handler's ToolRefusalError as a failure with the refusal's own failure code", async () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition<Record<string, never>, never> = {
      name: "refusing_tool",
      description: "test tool",
      mutating: true,
      inputSchema: z.object({}),
      handler: () => {
        throw new ToolRefusalError(
          "tenant_mismatch",
          "Refused: cross-tenant write.",
        );
      },
    };
    registry.register(tool);
    const idempotencyKey = `audit-refusal-${crypto.randomUUID()}`;

    const result = await executeToolWithAudit(
      registry,
      "refusing_tool",
      {},
      idempotencyKey,
      buildToolContext(),
    );

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "tenant_mismatch",
        message: "Refused: cross-tenant write.",
      },
    });

    const row = await findAuditRow(idempotencyKey);
    expect(row).not.toBeNull();
    if (row) createdIds.push(row.id);
    expect(row?.outcome).toBe("failure");
    expect(row?.failureCode).toBe("tenant_mismatch");
  });
});

describe("sanitizeToolInput", () => {
  it("redacts a phone-number-shaped digit run", () => {
    const sanitized = sanitizeToolInput({ phone: "5491122334455" });
    expect(sanitized).not.toContain("5491122334455");
    expect(sanitized).toContain("[redacted]");
  });

  it("redacts a token-shaped bearer credential", () => {
    const sanitized = sanitizeToolInput({
      note: "Authorization: Bearer abc.def-ghi123",
    });
    expect(sanitized).not.toContain("abc.def-ghi123");
    expect(sanitized).toContain("[redacted]");
  });
});
