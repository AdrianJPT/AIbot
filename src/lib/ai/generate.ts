import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Generates a chat completion using an already-resolved client. Callers
 * (e.g. message-handler.ts) resolve the client via callWithFailover from
 * ./resolve so that a bad key automatically fails over to a standby
 * credential without any redeploy.
 */
export async function generateResponse(
  client: OpenAI,
  systemPrompt: string,
  history: ChatCompletionMessageParam[],
  userMessage: string,
  model: string
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
