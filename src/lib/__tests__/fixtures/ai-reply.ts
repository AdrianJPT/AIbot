import type { GeneratedReply } from "@/lib/ai/generate";

/**
 * `generateResponse`'s resolved value for the handler tests, which mock the
 * module rather than calling a provider.
 *
 * Exists so that the shape of `GeneratedReply` lives in one place: it is mocked
 * in six test files, and when `usage` was added to it every one of them would
 * otherwise have needed the same edit. Same reason as
 * `fixtures/business.ts` — listing every field explicitly here turns a shape
 * change into a single type error instead of one per test file.
 */
export function buildAiReply(
  overrides: Partial<GeneratedReply> = {},
): GeneratedReply {
  return {
    content: "Respuesta generada",
    usage: {
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      cachedPromptTokens: 0,
    },
    ...overrides,
  };
}
