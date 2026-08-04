import { describe, expect, it } from "vitest";
import {
  MAX_KNOWLEDGE_DOC_CHARS,
  normalizeKnowledgeDoc,
} from "../businesses/create";
import { buildSystemPrompt } from "../prompt";
import { buildBusiness } from "./fixtures/business";

const DOC = "Carta:\n- Milanesa $8000\n- Empanada $1500\n\nHorario: 9 a 23.";

describe("buildSystemPrompt with a knowledge document", () => {
  it("renders the document before the admin-authored prompt", () => {
    const prompt = buildSystemPrompt(
      buildBusiness({
        knowledgeDoc: DOC,
        systemPrompt: "Atendés para {businessName}.",
        name: "Parrilla Don José",
      }),
    );

    expect(prompt).toContain(DOC);
    // Order is the whole point: the document is the largest stable block, and a
    // provider's prefix cache matches from the start of the prompt.
    expect(prompt.indexOf(DOC)).toBeLessThan(
      prompt.indexOf("Atendés para Parrilla Don José."),
    );
  });

  it("labels the document as reference material, not as instructions", () => {
    const prompt = buildSystemPrompt(buildBusiness({ knowledgeDoc: DOC }));
    expect(prompt).toContain("Documento de referencia del negocio");
    expect(prompt).toContain("no lo inventes");
  });

  it("keeps the trust-boundary rule last, after the document", () => {
    const prompt = buildSystemPrompt(buildBusiness({ knowledgeDoc: DOC }));
    expect(prompt.indexOf(DOC)).toBeLessThan(
      prompt.indexOf("Reglas de seguridad"),
    );
  });

  it("produces byte-identical output across calls, so the prefix can cache", () => {
    const business = buildBusiness({ knowledgeDoc: DOC });
    expect(buildSystemPrompt(business)).toBe(buildSystemPrompt(business));
  });

  it("interpolates no placeholders inside the document", () => {
    // A substitution is by definition something that can differ between calls,
    // and one differing byte at the front costs the whole cached prefix. The
    // document is reproduced verbatim, braces and all.
    const prompt = buildSystemPrompt(
      buildBusiness({
        knowledgeDoc: "Somos {businessName} y abrimos {businessInfo}.",
        name: "Parrilla Don José",
        businessInfo: { horario: "9 a 23" },
      }),
    );

    expect(prompt).toContain("Somos {businessName} y abrimos {businessInfo}.");
  });

  it("still interpolates the admin prompt's placeholders as before", () => {
    const prompt = buildSystemPrompt(
      buildBusiness({
        knowledgeDoc: DOC,
        name: "Parrilla Don José",
        systemPrompt:
          "Sos el asistente de {businessName}. Datos:\n{businessInfo}",
        businessInfo: { horario: "9 a 23" },
      }),
    );

    expect(prompt).toContain("Sos el asistente de Parrilla Don José.");
    expect(prompt).toContain("- horario: 9 a 23");
  });

  it("is byte-identical to the no-document output when the field is null", () => {
    // The backward-compatibility guarantee: every existing business has a null
    // document, and none of their prompts may shift by a single character.
    const base = buildBusiness({
      systemPrompt: "Atendés para {businessName}.\n{businessInfo}",
      businessInfo: { horario: "9 a 23" },
    });

    expect(buildSystemPrompt({ ...base, knowledgeDoc: null })).toBe(
      buildSystemPrompt(base),
    );
  });

  it("treats a whitespace-only document as no document at all", () => {
    const base = buildBusiness();
    expect(buildSystemPrompt({ ...base, knowledgeDoc: "   \n\t  " })).toBe(
      buildSystemPrompt({ ...base, knowledgeDoc: null }),
    );
  });
});

describe("normalizeKnowledgeDoc", () => {
  it("keeps a real document, trimmed", () => {
    expect(normalizeKnowledgeDoc(`\n  ${DOC}  \n`)).toBe(DOC);
  });

  it("turns blank input into null, so clearing the field disables the feature", () => {
    expect(normalizeKnowledgeDoc("")).toBeNull();
    expect(normalizeKnowledgeDoc("   \n\t ")).toBeNull();
  });

  it("returns null for anything that is not a string", () => {
    // The API accepts an arbitrary JSON body, so these are reachable.
    expect(normalizeKnowledgeDoc(undefined)).toBeNull();
    expect(normalizeKnowledgeDoc(null)).toBeNull();
    expect(normalizeKnowledgeDoc(42)).toBeNull();
    expect(normalizeKnowledgeDoc({ menu: "milanesa" })).toBeNull();
  });

  it("truncates past the character cap", () => {
    const huge = "a".repeat(MAX_KNOWLEDGE_DOC_CHARS + 5_000);
    const result = normalizeKnowledgeDoc(huge);
    expect(result).toHaveLength(MAX_KNOWLEDGE_DOC_CHARS);
  });

  it("leaves a document exactly at the cap untouched", () => {
    const exact = "b".repeat(MAX_KNOWLEDGE_DOC_CHARS);
    expect(normalizeKnowledgeDoc(exact)).toBe(exact);
  });

  it("never cuts a surrogate pair in half at the cap boundary", () => {
    // 😀 is one code point but two UTF-16 code units, so with the pair starting
    // at index MAX-1 a naive slice keeps its high half and drops the low one,
    // persisting invalid UTF-16 that buildSystemPrompt would then send verbatim
    // to the provider.
    const emoji = "\u{1F600}";
    expect(emoji).toHaveLength(2);

    const straddling =
      "a".repeat(MAX_KNOWLEDGE_DOC_CHARS - 1) + emoji + "resto";
    const result = normalizeKnowledgeDoc(straddling)!;

    // One character shorter than the cap, because the half-emoji was dropped
    // rather than kept.
    expect(result).toHaveLength(MAX_KNOWLEDGE_DOC_CHARS - 1);
    expect(result.endsWith("a")).toBe(true);
    // The real assertion: no unpaired surrogate survived anywhere.
    expect(hasLoneSurrogate(result)).toBe(false);
  });

  it("keeps a surrogate pair that ends exactly on the cap", () => {
    const emoji = "\u{1F600}";
    const aligned = "a".repeat(MAX_KNOWLEDGE_DOC_CHARS - 2) + emoji + "resto";
    const result = normalizeKnowledgeDoc(aligned)!;

    expect(result).toHaveLength(MAX_KNOWLEDGE_DOC_CHARS);
    expect(result.endsWith(emoji)).toBe(true);
    expect(hasLoneSurrogate(result)).toBe(false);
  });
});

/** True when `text` contains a high or low surrogate without its counterpart. */
function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const isHigh = unit >= 0xd800 && unit <= 0xdbff;
    const isLow = unit >= 0xdc00 && unit <= 0xdfff;
    if (isHigh) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++; // consume the valid pair
    } else if (isLow) {
      return true; // a low surrogate reached without a preceding high one
    }
  }
  return false;
}
