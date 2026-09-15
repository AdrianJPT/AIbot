import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResponseTimeBucket } from "@/lib/analytics/types";
import { ResponseTimePanel } from "../response-time-panel";

const buckets: ResponseTimeBucket[] = [
  { day: "2026-09-12", avgMs: 65_000, sampleCount: 3 },
  { day: "2026-09-13", avgMs: null, sampleCount: 0 },
];

describe("ResponseTimePanel", () => {
  it('labels the metric "time to respond", never "AI latency"', () => {
    const html = renderToStaticMarkup(<ResponseTimePanel buckets={buckets} />);

    expect(html).toContain("Tiempo hasta responder");
    expect(html.toLowerCase()).not.toContain("latencia de ia");
    expect(html.toLowerCase()).not.toContain("ai latency");
  });

  it("explains in the UI copy that the figure includes the configured reply debounce", () => {
    const html = renderToStaticMarkup(<ResponseTimePanel buckets={buckets} />);

    expect(html).toContain("tiempo de espera configurado");
    expect(html).toContain("4 veces");
  });

  it("shows a day with no completed reply distinctly, never as a zero-duration reply", () => {
    const html = renderToStaticMarkup(<ResponseTimePanel buckets={buckets} />);

    expect(html).toContain("Sin respuestas registradas");
    expect(html).not.toContain("0 s (n=0)");
  });

  it("renders elapsed time and sample count as visible text", () => {
    const html = renderToStaticMarkup(<ResponseTimePanel buckets={buckets} />);

    expect(html).toContain("1 min 5 s");
    expect(html).toContain("n=3");
  });

  it("labels the day axis as UTC", () => {
    const html = renderToStaticMarkup(<ResponseTimePanel buckets={buckets} />);

    expect(html).toContain("UTC");
  });
});
