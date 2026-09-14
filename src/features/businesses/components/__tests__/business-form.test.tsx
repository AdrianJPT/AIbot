import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BusinessDetail } from "@/features/businesses/types";
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
