import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NICHE_TEMPLATE_LIST } from "@/lib/niche-templates";
import { NicheTemplatePicker } from "../niche-template-picker";

describe("NicheTemplatePicker", () => {
  it("renders one option per registered giro, with correct value and label", () => {
    const html = renderToStaticMarkup(
      <NicheTemplatePicker value="" onChange={() => {}} />,
    );

    for (const template of NICHE_TEMPLATE_LIST) {
      expect(html).toMatch(
        new RegExp(`<option value="${template.id}">${template.label}</option>`),
      );
    }
  });

  it("renders a leading empty/placeholder option for 'no giro selected'", () => {
    const html = renderToStaticMarkup(
      <NicheTemplatePicker value="" onChange={() => {}} />,
    );

    expect(html).toMatch(/<option value=""[^>]*>[^<]*<\/option>/);
  });

  it("marks the option matching the current value as selected", () => {
    const [first] = NICHE_TEMPLATE_LIST;
    const html = renderToStaticMarkup(
      <NicheTemplatePicker value={first.id} onChange={() => {}} />,
    );

    expect(html).toMatch(
      new RegExp(
        `<option value="${first.id}" selected="">${first.label}</option>`,
      ),
    );
  });
});
