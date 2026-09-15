import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../contracts";
import { ToolRegistry } from "../registry";
import { executeToolWithAudit, sanitizeToolInput } from "../audit";

const createdIds: string[] = [];

async function findAuditRow(idempotencyKey: string) {
  return prisma.toolExecutionAudit.findUnique({ where: { idempotencyKey } });
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
      inputSchema: z.object({}),
      handler,
    };
    registry.register(tool);
    const idempotencyKey = `audit-idempotent-${crypto.randomUUID()}`;

    const first = await executeToolWithAudit(
      registry,
      "echo_tool",
      {},
      idempotencyKey,
    );
    const second = await executeToolWithAudit(
      registry,
      "echo_tool",
      {},
      idempotencyKey,
    );

    // The critical assertion: the handler ran exactly once across BOTH
    // invocations, not merely that both calls returned equal values.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    const row = await findAuditRow(idempotencyKey);
    if (row) createdIds.push(row.id);
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
