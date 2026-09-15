import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RangeSelector } from "../range-selector";

describe("RangeSelector", () => {
  it("offers only the two fixed ranges, never open-ended", () => {
    const html = renderToStaticMarkup(
      <RangeSelector value="30d" onChange={() => {}} />,
    );

    expect(html).toContain("7 días");
    expect(html).toContain("30 días");
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it("marks the active range as pressed, and the other one as not", () => {
    const html = renderToStaticMarkup(
      <RangeSelector value="7d" onChange={() => {}} />,
    );

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});
