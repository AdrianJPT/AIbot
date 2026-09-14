import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerServiceWindowBanner } from "../customer-service-window-banner";

describe("CustomerServiceWindowBanner", () => {
  it("renders nothing when the state is within the window", () => {
    const html = renderToStaticMarkup(
      <CustomerServiceWindowBanner state="within" />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when the state is indeterminate", () => {
    const html = renderToStaticMarkup(
      <CustomerServiceWindowBanner state="indeterminate" />,
    );
    expect(html).toBe("");
  });

  it("renders a warning banner when the state is outside the window", () => {
    const html = renderToStaticMarkup(
      <CustomerServiceWindowBanner state="outside" />,
    );
    expect(html).toContain("ventana de atención");
    expect(html).toContain('data-testid="customer-service-window-banner"');
  });

  it("never renders a disabled attribute — the composer stays enabled", () => {
    const html = renderToStaticMarkup(
      <CustomerServiceWindowBanner state="outside" />,
    );
    expect(html).not.toContain("disabled");
  });

  it("does not use debounce-related identifiers or copy", () => {
    const html = renderToStaticMarkup(
      <CustomerServiceWindowBanner state="outside" />,
    );
    expect(html.toLowerCase()).not.toContain("debounce");
    expect(html.toLowerCase()).not.toContain("replywindow");
  });
});
