import { describe, expect, it } from "vitest";
import { buildBusiness } from "@/lib/__tests__/fixtures/business";
import type { Conversation } from "@prisma/client";
import { ToolRegistry } from "../registry";
import { kernelProbeTool } from "../kernel-probe";
import type { ToolPipelineContext } from "../tenant-guard";

/** This probe never reads its context — a fixture business plus a cast
 * conversation stub is enough, same as the registry/audit unit tests. */
function buildToolContext(): ToolPipelineContext {
  return {
    business: buildBusiness(),
    conversation: { id: "conv_1", businessId: "biz_1" } as Conversation,
  };
}

describe("kernelProbeTool", () => {
  it("registers and executes end to end, echoing its input back", async () => {
    const registry = new ToolRegistry();
    registry.register(kernelProbeTool);

    const result = await registry.executeTool(
      kernelProbeTool.name,
      { echo: "ping" },
      buildToolContext(),
    );

    expect(result).toEqual({
      ok: true,
      data: { alive: true, echo: "ping" },
    });
  });

  it("rejects empty input before the handler runs, via the registry's own validation", async () => {
    const registry = new ToolRegistry();
    registry.register(kernelProbeTool);

    const result = await registry.executeTool(
      kernelProbeTool.name,
      { echo: "" },
      buildToolContext(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_input");
    }
  });
});
