/**
 * The one diagnostic tool in the kernel: a read-only, side-effect-free
 * probe that proves the registry's validate-then-invoke path end to end.
 * It touches no tenant data and exists purely to be registered and called.
 */
import { z } from "zod";
import type { ToolDefinition } from "./contracts";

export const kernelProbeInputSchema = z.object({
  echo: z.string().min(1).max(200),
});

export type KernelProbeInput = z.infer<typeof kernelProbeInputSchema>;

export type KernelProbeOutput = {
  alive: true;
  echo: string;
};

export const kernelProbeTool: ToolDefinition<
  KernelProbeInput,
  KernelProbeOutput
> = {
  name: "kernel_probe",
  description:
    "Read-only diagnostic tool: echoes its input back and confirms the tool kernel is reachable. No side effects, no tenant data.",
  inputSchema: kernelProbeInputSchema,
  handler: (input) => ({ alive: true, echo: input.echo }),
};
