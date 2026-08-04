import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { SystemPrompt } from "../prompt";

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
 */
export async function generateResponse(
  client: OpenAI,
  systemPrompt: SystemPrompt,
  history: ChatCompletionMessageParam[],
  userMessage: string,
  model: string,
): Promise<string> {
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

  return (
    response.choices[0]?.message?.content?.trim() ||
    "Lo siento, no pude generar una respuesta."
  );
}
