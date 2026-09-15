import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TokenUsage } from "@/lib/analytics/types";
import { TokenUsagePanel } from "../token-usage-panel";

const usage: TokenUsage = {
  promptTokens: 12345,
  completionTokens: 6789,
  totalTokens: 19134,
  sampleCount: 42,
};

const empty: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  sampleCount: 0,
};

describe("TokenUsagePanel", () => {
  it("renders raw prompt/completion/total token counts as text", () => {
    const html = renderToStaticMarkup(<TokenUsagePanel usage={usage} />);

    expect(html).toContain("12,345");
    expect(html).toContain("6,789");
    expect(html).toContain("19,134");
    expect(html).toContain("42");
  });

  it("never renders a dollar figure — raw counts only", () => {
    const html = renderToStaticMarkup(<TokenUsagePanel usage={usage} />);

    expect(html).not.toContain("$");
    expect(html).not.toContain("USD");
  });

  it("renders zero counts, not NaN, when there is no usage data", () => {
    const html = renderToStaticMarkup(<TokenUsagePanel usage={empty} />);

    expect(html).toContain("0 respuestas");
    expect(html).not.toContain("NaN");
  });
});
