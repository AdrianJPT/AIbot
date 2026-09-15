import type {
  AiDefaults,
  ToolsPlatformConfig,
} from "@/features/settings/types";
import { requestJson } from "@/lib/api-client";

export function fetchAiDefaults(): Promise<AiDefaults> {
  return requestJson<AiDefaults>("/api/settings/ai-defaults");
}

export function updateAiDefaults(payload: AiDefaults): Promise<AiDefaults> {
  return requestJson<AiDefaults>("/api/settings/ai-defaults", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateToolsPlatformConfig(
  payload: ToolsPlatformConfig,
): Promise<ToolsPlatformConfig> {
  return requestJson<ToolsPlatformConfig>("/api/settings/tools", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
