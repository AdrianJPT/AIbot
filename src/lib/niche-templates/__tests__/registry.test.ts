import { describe, expect, it } from "vitest";
import { MAX_KNOWLEDGE_DOC_CHARS } from "@/lib/businesses/create";
import {
  NICHE_TEMPLATE_LIST,
  resolveNicheTemplate,
} from "@/lib/niche-templates";

/**
 * Common Spanish function words used as a lightweight language heuristic.
 * A full language detector is unjustified for a small set of known-authored
 * strings (see design's Testing Strategy) — two or more hits is enough to
 * catch an accidental English placeholder without false-flagging short,
 * legitimately Spanish copy.
 */
const SPANISH_FUNCTION_WORDS = ["de", "para", "que", "con", "del"];

function countSpanishFunctionWordHits(text: string): number {
  const lower = text.toLowerCase();
  return SPANISH_FUNCTION_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`, "u").test(lower),
  ).length;
}

const PLACEHOLDER_MARKERS = ["TODO", "lorem", "FIXME"];

/**
 * Matches a contiguous run of digits and common phone separators
 * (space, dot, dash, parens, leading +) that contains at least 7 actual
 * digits — enough to be dialable. Deliberately loose about the separators
 * so `"+54 9 11 5555-5555"` and `"011 4555-1234"` both match, while short
 * quantities like `"4 km"`, `"8 personas"` or clock times like `"12:00"`
 * (broken up by the colon, which is not in the separator class) stay under
 * the digit threshold.
 */
const PHONE_LIKE_RUN = /[+(]?\d[\d\s().-]{4,}\d/gu;

function containsPhoneNumberShape(text: string): boolean {
  const candidates = text.match(PHONE_LIKE_RUN) ?? [];
  return candidates.some(
    (candidate) => (candidate.match(/\d/g) ?? []).length >= 7,
  );
}

/**
 * Matches a Spanish street-type word ("Av.", "Avenida", "Calle", ...)
 * followed by a handful of words and then a number — the shape of a street
 * address like `"Av. Siempre Viva 742"`.
 */
const STREET_ADDRESS_LIKE =
  /\b(?:av|avenida|calle|blvd|boulevard|ruta|pasaje|diagonal)\.?\s+(?:[a-zá-úñ]+\s+){0,4}\d+\b/iu;

function containsStreetAddressShape(text: string): boolean {
  return STREET_ADDRESS_LIKE.test(text);
}

/**
 * The agreed placeholder convention (see the "niche-templates" orchestrator
 * content ruling): every `businessInfoTemplate` value must be wrapped in
 * square brackets that tell the operator what to write and show the
 * expected shape, e.g.
 * `"[Completá tu horario de atención, por ejemplo: martes a domingo de
 * 12:00 a 15:30]"`. This is what makes the value a self-evident placeholder
 * instead of a plausible invented fact.
 */
function isMarkedPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

describe("resolveNicheTemplate", () => {
  it("resolves a known niche id to its registry entry", () => {
    const entry = resolveNicheTemplate("restaurante");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("restaurante");
  });

  it("returns undefined for an unknown id, never throws", () => {
    expect(() => resolveNicheTemplate("does-not-exist")).not.toThrow();
    expect(resolveNicheTemplate("does-not-exist")).toBeUndefined();
  });

  it("returns undefined for an empty id, never throws", () => {
    expect(() => resolveNicheTemplate("")).not.toThrow();
    expect(resolveNicheTemplate("")).toBeUndefined();
  });
});

describe("content integrity across the registry", () => {
  it.each(NICHE_TEMPLATE_LIST)(
    "$id: knowledge doc is null or under MAX_KNOWLEDGE_DOC_CHARS",
    (template) => {
      if (template.knowledgeDocTemplate === null) {
        expect(template.knowledgeDocTemplate).toBeNull();
        return;
      }
      expect(template.knowledgeDocTemplate.length).toBeGreaterThan(0);
      expect(template.knowledgeDocTemplate.length).toBeLessThan(
        MAX_KNOWLEDGE_DOC_CHARS,
      );
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: businessInfoTemplate is a flat Record<string,string> that round-trips",
    (template) => {
      const roundTripped = JSON.parse(
        JSON.stringify(template.businessInfoTemplate),
      );
      expect(roundTripped).toEqual(template.businessInfoTemplate);
      const values = Object.values(template.businessInfoTemplate);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(typeof value).toBe("string");
      }
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: systemPromptTemplate and welcomeMessageTemplate are non-empty",
    (template) => {
      expect(template.systemPromptTemplate.trim().length).toBeGreaterThan(0);
      expect(template.welcomeMessageTemplate.trim().length).toBeGreaterThan(0);
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: text fields read as Spanish",
    (template) => {
      expect(
        countSpanishFunctionWordHits(template.systemPromptTemplate),
      ).toBeGreaterThanOrEqual(2);
      expect(
        countSpanishFunctionWordHits(template.welcomeMessageTemplate),
      ).toBeGreaterThanOrEqual(2);
      if (template.knowledgeDocTemplate) {
        expect(
          countSpanishFunctionWordHits(template.knowledgeDocTemplate),
        ).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: contains no placeholder text",
    (template) => {
      const haystack = [
        template.systemPromptTemplate,
        template.welcomeMessageTemplate,
        template.knowledgeDocTemplate ?? "",
        ...Object.values(template.businessInfoTemplate),
      ].join("\n");
      for (const marker of PLACEHOLDER_MARKERS) {
        expect(haystack).not.toMatch(new RegExp(marker, "i"));
      }
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: no businessInfoTemplate value contains a phone-number-shaped string",
    (template) => {
      for (const [key, value] of Object.entries(
        template.businessInfoTemplate,
      )) {
        expect(
          containsPhoneNumberShape(value),
          `businessInfoTemplate.${key} looks like it contains a real phone number: "${value}"`,
        ).toBe(false);
      }
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: no businessInfoTemplate value contains a street-address-shaped string",
    (template) => {
      for (const [key, value] of Object.entries(
        template.businessInfoTemplate,
      )) {
        expect(
          containsStreetAddressShape(value),
          `businessInfoTemplate.${key} looks like it contains a real street address: "${value}"`,
        ).toBe(false);
      }
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: every businessInfoTemplate value is a marked placeholder",
    (template) => {
      for (const [key, value] of Object.entries(
        template.businessInfoTemplate,
      )) {
        expect(
          isMarkedPlaceholder(value),
          `businessInfoTemplate.${key} is not wrapped as "[...]": "${value}"`,
        ).toBe(true);
      }
    },
  );

  it.each(NICHE_TEMPLATE_LIST)(
    "$id: knowledgeDocTemplate contains no phone-number-shaped string",
    (template) => {
      if (!template.knowledgeDocTemplate) {
        return;
      }
      expect(containsPhoneNumberShape(template.knowledgeDocTemplate)).toBe(
        false,
      );
    },
  );

  it("has no two entries sharing a systemPromptTemplate", () => {
    const prompts = NICHE_TEMPLATE_LIST.map((t) => t.systemPromptTemplate);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("has no duplicate id or label", () => {
    const ids = NICHE_TEMPLATE_LIST.map((t) => t.id);
    const labels = NICHE_TEMPLATE_LIST.map((t) => t.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
