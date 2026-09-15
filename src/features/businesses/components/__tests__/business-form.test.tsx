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
