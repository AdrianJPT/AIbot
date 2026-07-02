import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function generateResponse(
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

  const response = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    "Lo siento, no pude generar una respuesta."
  );
}
