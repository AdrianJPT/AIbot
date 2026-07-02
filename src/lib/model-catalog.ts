export type ProviderId = "openai" | "openrouter" | "google";

export type ModelOption = {
  id: string;
  label: string;
  vision: boolean;
};

export type ProviderInfo = {
  label: string;
  baseURL?: string;
  apiKeyEnv: string;
  models: ModelOption[];
};

export const DEFAULT_PROVIDER: ProviderId = "openai";
export const DEFAULT_MODEL = "gpt-4o-mini";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", vision: true },
      { id: "gpt-4o", label: "GPT-4o", vision: true },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", vision: true },
      { id: "gpt-4.1", label: "GPT-4.1", vision: true },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    models: [
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", vision: true },
      {
        id: "anthropic/claude-sonnet-4.5",
        label: "Claude Sonnet 4.5",
        vision: true,
      },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        label: "Llama 3.3 70B",
        vision: false,
      },
    ],
  },
  google: {
    label: "Google AI Studio",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GOOGLE_API_KEY",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
    ],
  },
};

export function normalizeProvider(provider: string): ProviderId {
  return provider in PROVIDERS ? (provider as ProviderId) : DEFAULT_PROVIDER;
}

export function supportsVision(provider: string, model: string): boolean {
  const info = PROVIDERS[normalizeProvider(provider)];
  return info.models.find((m) => m.id === model)?.vision ?? false;
}
