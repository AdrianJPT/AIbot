import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../registry";
import { kernelProbeTool } from "../kernel-probe";

describe("kernelProbeTool", () => {
  it("registers and executes end to end, echoing its input back", async () => {
    const registry = new ToolRegistry();
    registry.register(kernelProbeTool);

    const result = await registry.executeTool(kernelProbeTool.name, {
      echo: "ping",
    });

    expect(result).toEqual({
      ok: true,
      data: { alive: true, echo: "ping" },
    });
  });

  it("rejects empty input before the handler runs, via the registry's own validation", async () => {
    const registry = new ToolRegistry();
    registry.register(kernelProbeTool);

    const result = await registry.executeTool(kernelProbeTool.name, {
      echo: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_input");
    }
  });
});
