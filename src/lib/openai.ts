import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getProviderClient } from "./providers";

export async function generateResponse(
  systemPrompt: string,
  history: ChatCompletionMessageParam[],
  userMessage: string,
  provider: string,
  model: string
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await getProviderClient(provider).chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    "Lo siento, no pude generar una respuesta."
  );
}
