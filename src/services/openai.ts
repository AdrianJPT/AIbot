import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content?.trim() || "Lo siento, no pude generar una respuesta.";
}
