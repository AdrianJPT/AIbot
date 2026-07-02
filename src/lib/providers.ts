import OpenAI from "openai";
import {
  normalizeProvider,
  PROVIDERS,
  type ProviderId,
} from "./model-catalog";

const clients = new Map<ProviderId, OpenAI>();

export function getProviderClient(provider: string): OpenAI {
  const id = normalizeProvider(provider);
  let client = clients.get(id);
  if (!client) {
    const info = PROVIDERS[id];
    const apiKey = process.env[info.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `Missing ${info.apiKeyEnv} environment variable for provider "${id}"`
      );
    }
    client = new OpenAI({ apiKey, baseURL: info.baseURL });
    clients.set(id, client);
  }
  return client;
}
