import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DayBucket } from "@/lib/analytics/types";
import { VolumeChart } from "../volume-chart";

const buckets: DayBucket[] = [
  { day: "2026-09-12", inbound: 4, outbound: 2 },
  { day: "2026-09-13", inbound: 0, outbound: 0 },
];

describe("VolumeChart", () => {
  it("carries a descriptive title per day restating both counts", () => {
    const html = renderToStaticMarkup(<VolumeChart buckets={buckets} />);

    expect(html).toContain("4 entrantes");
    expect(html).toContain("2 salientes");
  });

  it("restates every bucket in a hidden table, including a zero-traffic day", () => {
    const html = renderToStaticMarkup(<VolumeChart buckets={buckets} />);

    expect(html).toContain('class="sr-only"');
    expect(html).toContain("<td>2026-09-13</td><td>0</td><td>0</td>");
  });

  it("never omits a zero-traffic day's bar pair", () => {
    const html = renderToStaticMarkup(<VolumeChart buckets={buckets} />);

    // 2 days * 2 bars (inbound + outbound) = 4 <rect> elements
    expect((html.match(/<rect/g) ?? []).length).toBe(4);
  });

  it("distinguishes inbound/outbound by shape, not color alone", () => {
    const html = renderToStaticMarkup(<VolumeChart buckets={buckets} />);

    expect(html).toContain('stroke-dasharray="2,2"');
    expect(html).toMatch(/fill="currentColor"/);
  });

  it("labels the day axis as UTC", () => {
    const html = renderToStaticMarkup(<VolumeChart buckets={buckets} />);

    expect(html).toContain("UTC");
  });
});
