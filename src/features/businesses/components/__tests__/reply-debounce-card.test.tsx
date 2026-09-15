import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplyDebounceCard } from "../reply-debounce-card";

function render(replyWindowMs: number) {
  return renderToStaticMarkup(
    <ReplyDebounceCard replyWindowMs={replyWindowMs} />,
  );
}

describe("ReplyDebounceCard", () => {
  it("renders a range slider bound to replyWindowSeconds with the business's current value", () => {
    const html = render(5_000);

    expect(html).toMatch(/name="replyWindowSeconds"[^>]*type="range"/);
    expect(html).toMatch(/min="0"/);
    expect(html).toMatch(/max="300"/);
    expect(html).toMatch(/name="replyWindowSeconds"[^>]*value="5"/);
  });

  it("renders the lower clamp boundary (0ms) as slider value 0", () => {
    const html = render(0);

    expect(html).toMatch(/name="replyWindowSeconds"[^>]*value="0"/);
  });

  it("renders the upper clamp boundary (300000ms) as slider value 300", () => {
    const html = render(300_000);

    expect(html).toMatch(/name="replyWindowSeconds"[^>]*value="300"/);
  });

  it("shows a live seconds readout matching the current value", () => {
    const html = render(5_000);

    expect(html).toContain("5 s");
  });

  it("never references the WhatsApp customer-service window", () => {
    const html = render(5_000).toLowerCase();

    expect(html).not.toContain("24h");
    expect(html).not.toContain("ventana de atención");
    expect(html).not.toContain("csw");
    expect(html).not.toContain("customerservicewindow");
  });
});
