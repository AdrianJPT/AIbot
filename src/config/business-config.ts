import * as fs from "fs";
import * as path from "path";

export interface BusinessConfig {
  businessName: string;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo: Record<string, string>;
  model: string;
  maxHistoryMessages: number;
}

let cachedConfig: BusinessConfig | null = null;

export function loadConfig(): BusinessConfig {
  if (cachedConfig) return cachedConfig;

  const configName = process.env.ACTIVE_CONFIG || "restaurante";
  const configPath = path.resolve(__dirname, "../../configs", `${configName}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw: BusinessConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Replace {businessName} placeholders
  const infoBlock = Object.entries(raw.businessInfo)
    .map(([key, val]) => `- ${key}: ${val}`)
    .join("\n");

  raw.systemPrompt = raw.systemPrompt
    .replace(/{businessName}/g, raw.businessName)
    .replace(/{businessInfo}/g, infoBlock);

  raw.welcomeMessage = raw.welcomeMessage.replace(
    /{businessName}/g,
    raw.businessName
  );

  cachedConfig = raw;
  return cachedConfig;
}
