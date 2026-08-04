import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { generateResponse } from "../ai/generate";
import { buildSystemPrompt } from "../prompt";
import { buildBusiness } from "./fixtures/business";

/**
 * Covers the one thing the handler tests cannot: they mock
 * `generateResponse`, so nothing there proves the provider's snake_case `usage`
 * block is read correctly. This translates a real response shape — including
 * the nested `prompt_tokens_details.cached_tokens`, which is the field that
 * answers whether the stable prefix is being cached — and asserts what comes
 * out the other side.
 */
function clientReturning(response: unknown): OpenAI {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue(response) } },
  } as unknown as OpenAI;
}

const reply = { message: { content: "  Hola, con gusto te ayudo.  " } };

async function generateWith(response: unknown) {
  return generateResponse(
    clientReturning(response),
    buildSystemPrompt(buildBusiness()),
    [],
    "hola",
    "gpt-4o-mini",
  );
}

describe("generateResponse usage mapping", () => {
  it("maps the provider's usage block, including nested cached prompt tokens", async () => {
    const result = await generateWith({
      choices: [reply],
      usage: {
        prompt_tokens: 2006,
        completion_tokens: 300,
        total_tokens: 2306,
        prompt_tokens_details: { cached_tokens: 1920 },
      },
    });

    expect(result.content).toBe("Hola, con gusto te ayudo.");
    expect(result.usage).toEqual({
      promptTokens: 2006,
      completionTokens: 300,
      totalTokens: 2306,
      cachedPromptTokens: 1920,
    });
  });

  it("reports zero cached tokens when the provider omits the details block", async () => {
    // The common case today: prompts under the provider's caching threshold get
    // a usage block with no prompt_tokens_details at all. Zero is the honest
    // answer, and distinguishing it from "no usage at all" is the point.
    const result = await generateWith({
      choices: [reply],
      usage: { prompt_tokens: 180, completion_tokens: 25, total_tokens: 205 },
    });

    expect(result.usage).toEqual({
      promptTokens: 180,
      completionTokens: 25,
      totalTokens: 205,
      cachedPromptTokens: 0,
    });
  });

  it("reports zero when the details block exists but carries no cached count", async () => {
    const result = await generateWith({
      choices: [reply],
      usage: {
        prompt_tokens: 180,
        completion_tokens: 25,
        total_tokens: 205,
        prompt_tokens_details: { audio_tokens: 0 },
      },
    });

    expect(result.usage?.cachedPromptTokens).toBe(0);
  });

  it("returns null usage when the provider sends none, rather than zeroes", async () => {
    // Zeroes would be indistinguishable from a genuinely free call and would
    // quietly poison any cost aggregation built on these rows.
    const result = await generateWith({ choices: [reply] });

    expect(result.usage).toBeNull();
    expect(result.content).toBe("Hola, con gusto te ayudo.");
  });

  it("still returns the fallback content with usage when the model returns nothing", async () => {
    const result = await generateWith({
      choices: [{ message: { content: "" } }],
      usage: {
        prompt_tokens: 90,
        completion_tokens: 0,
        total_tokens: 90,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    expect(result.content).toBe("Lo siento, no pude generar una respuesta.");
    // An empty completion still cost prompt tokens — dropping the usage here
    // would under-report spend on exactly the calls worth investigating.
    expect(result.usage?.promptTokens).toBe(90);
  });
});
