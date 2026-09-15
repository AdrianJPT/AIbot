import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolsPlatformCard } from "../tools-platform-card";

describe("ToolsPlatformCard", () => {
  it("renders the switch off by default and named for form submission", () => {
    const html = renderToStaticMarkup(
      <ToolsPlatformCard
        toolsEnabled={false}
        saving={false}
        onSubmit={() => {}}
      />,
    );

    expect(html).toMatch(/name="toolsEnabled"/);
    expect(html).not.toMatch(/data-state="checked"/);
  });

  it("reflects an enabled platform switch", () => {
    const html = renderToStaticMarkup(
      <ToolsPlatformCard
        toolsEnabled={true}
        saving={false}
        onSubmit={() => {}}
      />,
    );

    expect(html).toMatch(/data-state="checked"/);
  });

  it("explains both switches are required and that no new abilities are granted", () => {
    const html = renderToStaticMarkup(
      <ToolsPlatformCard
        toolsEnabled={false}
        saving={false}
        onSubmit={() => {}}
      />,
    );

    expect(html).toMatch(/negocio/i);
    expect(html).toMatch(/diagnóstico/i);
  });
});
