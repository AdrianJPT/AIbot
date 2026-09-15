import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BusinessDetail } from "@/features/businesses/types";
import type { NicheTemplate } from "@/lib/niche-templates";
import { BusinessFormFields } from "../business-form";

function renderReplyWindow(business?: BusinessDetail) {
  return renderToStaticMarkup(
    <BusinessFormFields business={business} credentials={[]} />,
  );
}

describe("BusinessFormFields reply window", () => {
  it("renders the dedicated debounce card with five seconds for a new business", () => {
    const html = renderReplyWindow();

    expect(html).toMatch(/name="replyWindowSeconds"[^>]*type="range"/);
    expect(html).toMatch(/name="replyWindowSeconds"[^>]*value="5"/);
    expect(html).toContain("Demora antes de responder");
  });

  it("shows an existing explicit zero instead of replacing it with the default", () => {
    const business: BusinessDetail = {
      id: "business-1",
      name: "Immediate business",
      phoneNumberId: null,
      systemPrompt: "prompt",
      welcomeMessage: "welcome",
      businessInfo: {},
      knowledgeDoc: null,
      model: null,
      visionModel: null,
      audioModel: null,
      maxHistoryMessages: 20,
      replyWindowMs: 0,
      isActive: true,
    };

    expect(renderReplyWindow(business)).toMatch(
      /name="replyWindowSeconds"[^>]*value="0"/,
    );
  });
});

const FIXTURE_TEMPLATE: NicheTemplate = {
  id: "restaurante",
  label: "Restaurante",
  systemPromptTemplate:
    "Sos el asistente de un restaurante que atiende con calidez.",
  welcomeMessageTemplate: "¡Hola! Bienvenido a {businessName}.",
  businessInfoTemplate: { horario_atencion: "[Completá tu horario]" },
  knowledgeDocTemplate: "Preguntas frecuentes sobre el menú y las reservas.",
  defaultReplyWindowMs: 5_000,
};

describe("BusinessFormFields niche template picker", () => {
  it("renders the picker in create mode (no business)", () => {
    const html = renderToStaticMarkup(
      <BusinessFormFields business={undefined} credentials={[]} />,
    );

    expect(html).toContain('id="nicheId"');
  });

  it("omits the picker entirely in edit mode (business is set)", () => {
    const business: BusinessDetail = {
      id: "business-1",
      name: "Existing business",
      phoneNumberId: null,
      systemPrompt: "prompt",
      welcomeMessage: "welcome",
      businessInfo: {},
      knowledgeDoc: null,
      model: null,
      visionModel: null,
      audioModel: null,
      maxHistoryMessages: 20,
      replyWindowMs: 0,
      isActive: true,
    };

    const html = renderToStaticMarkup(
      <BusinessFormFields business={business} credentials={[]} />,
    );

    expect(html).not.toContain('id="nicheId"');
  });
});

describe("BusinessFormFields template prefill", () => {
  it("prefills systemPrompt, welcomeMessage, businessInfo and knowledgeDoc from templateFields", () => {
    const html = renderToStaticMarkup(
      <BusinessFormFields
        business={undefined}
        credentials={[]}
        templateFields={FIXTURE_TEMPLATE}
        nicheId="restaurante"
        onNicheChange={() => {}}
        onTemplatedFieldEdit={() => {}}
      />,
    );

    expect(html).toContain(FIXTURE_TEMPLATE.systemPromptTemplate);
    expect(html).toContain(FIXTURE_TEMPLATE.welcomeMessageTemplate);
    // businessInfo is JSON-stringified into the textarea; check for the
    // template's key/value rather than exact quote-escaping, which is an
    // SSR implementation detail.
    expect(html).toContain("horario_atencion");
    expect(html).toContain("Completá tu horario");
    expect(html).toContain(FIXTURE_TEMPLATE.knowledgeDocTemplate as string);
  });

  it("passes defaultReplyWindowMs to ReplyDebounceCard when a template is applied", () => {
    const html = renderToStaticMarkup(
      <BusinessFormFields
        business={undefined}
        credentials={[]}
        templateFields={FIXTURE_TEMPLATE}
        nicheId="restaurante"
        onNicheChange={() => {}}
        onTemplatedFieldEdit={() => {}}
      />,
    );

    expect(html).toMatch(/name="replyWindowSeconds"[^>]*value="5"/);
  });
});

// The core promise of the giro picker is that a prefilled field is still the
// operator's field: whatever they type must win over the template. This repo
// has no jsdom/testing-library (environment: "node" in vitest.config.ts), so
// we can't simulate typing and read back a changed value. What we CAN prove
// at the source level is the mechanism that makes editing possible at all:
// every templated field is rendered uncontrolled (`defaultValue`, no `value`
// prop). React only ever seeds an uncontrolled field once, on mount — a
// `value` prop would instead re-pin it on every re-render (including the one
// its own onChange triggers), silently discarding the operator's edit. This
// mirrors the repo's existing "read the source and assert its shape"
// convention (see `raw SQL safety` in analytics/repository.test.ts).
describe("BusinessFormFields templated fields stay editable (uncontrolled, not pinned)", () => {
  const businessFormSource = readFileSync(
    path.join(__dirname, "../business-form.tsx"),
    "utf-8",
  );
  const replyDebounceSource = readFileSync(
    path.join(__dirname, "../reply-debounce-card.tsx"),
    "utf-8",
  );

  function extractSelfClosingElement(source: string, fieldId: string): string {
    const match = source.match(new RegExp(`id="${fieldId}"[\\s\\S]*?/>`));
    if (!match) {
      throw new Error(
        `expected a self-closing element with id="${fieldId}" in the source`,
      );
    }
    return match[0];
  }

  it.each([
    ["welcomeMessage", "business-form.tsx", () => businessFormSource],
    ["systemPrompt", "business-form.tsx", () => businessFormSource],
    ["businessInfo", "business-form.tsx", () => businessFormSource],
    ["knowledgeDoc", "business-form.tsx", () => businessFormSource],
    [
      "replyWindowSeconds",
      "reply-debounce-card.tsx",
      () => replyDebounceSource,
    ],
  ] as const)(
    "%s (%s) is rendered with defaultValue and no pinning value prop",
    (fieldId, _file, getSource) => {
      const element = extractSelfClosingElement(getSource(), fieldId);

      expect(element).toMatch(/defaultValue=/);
      expect(element).not.toMatch(/\bvalue=/);
    },
  );
});
