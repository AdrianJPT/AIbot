import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { SystemPrompt } from "../prompt";

/**
 * Token accounting for one AI call, normalized off the provider's snake_case
 * shape so the persisted JSON stays stable even if the SDK's does not.
 */
export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /**
   * Prompt tokens the provider served from its cache. OpenAI caches
   * automatically once the stable prefix of a prompt reaches ~1024 tokens, so a
   * persistent 0 here is the signal that the prefix is still under that
   * threshold and nothing is being cached — not that caching is broken.
   */
  cachedPromptTokens: number;
};

export type GeneratedReply = {
  content: string;
  /** Null when the provider returned no usage block at all. */
  usage: AiUsage | null;
};

/**
 * Generates a chat completion using an already-resolved client. Callers
 * (e.g. message-handler.ts) resolve the client via callWithAiCredential
 * from ./resolve, which persists lastUsedAt/lastError on the credential
 * around the call.
 *
 * `systemPrompt` is the branded `SystemPrompt` rather than a `string` on
 * purpose: it is the compile-time half of the trust boundary. Customer-derived
 * text — a batched message, a resolved quote, a stored summary — is a plain
 * `string`, so it can only ever reach `userMessage` or `history`, and routing it
 * into the system role fails to typecheck. Only `buildSystemPrompt` mints the
 * branded type.
 *
 * Returns the usage block alongside the reply rather than logging it here: this
 * is a thin provider wrapper with no database dependency, and it is the caller
 * that knows which business and conversation the call belongs to.
 */
export async function generateResponse(
  client: OpenAI,
  systemPrompt: SystemPrompt,
  history: ChatCompletionMessageParam[],
  userMessage: string,
  model: string,
): Promise<GeneratedReply> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });

  const usage = response.usage;

  return {
    content:
      response.choices[0]?.message?.content?.trim() ||
      "Lo siento, no pude generar una respuesta.",
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : null,
  };
}
