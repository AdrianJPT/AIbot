import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessageBubble, type RenderableMessage } from "../message-bubble";

const baseMessage: RenderableMessage = {
  id: "msg-1",
  role: "user",
  content: "Hola",
  mediaType: "text",
  sentBy: "customer",
  status: "sent",
  createdAt: new Date().toISOString(),
};

const failedBotMessage: RenderableMessage = {
  ...baseMessage,
  id: "msg-failed",
  role: "assistant",
  sentBy: "bot",
  status: "failed",
};

function renderBubble(
  message: RenderableMessage,
  props: { onRetry?: () => void; retrying?: boolean } = {},
) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MessageBubble message={message} {...props} />
    </QueryClientProvider>,
  );
}

describe("MessageBubble — inline payment card (tasks #568 PR4)", () => {
  it("renders no payment card for an ordinary message", () => {
    const html = renderBubble(baseMessage);
    expect(html).not.toContain("Cargando pago");
  });

  it("renders the inline payment card for a message linked to a PaymentProof", () => {
    const html = renderBubble({
      ...baseMessage,
      paymentSessionId: "session-1",
    });
    // Initial render (no effects run under renderToStaticMarkup) shows the
    // loading state — proves the card mounts and calls useQuery for that
    // sessionId without needing to await a real fetch.
    expect(html).toContain("Cargando pago");
  });

  it("renders nothing extra when paymentSessionId is explicitly null", () => {
    const html = renderBubble({ ...baseMessage, paymentSessionId: null });
    expect(html).not.toContain("Cargando pago");
  });
});

describe("MessageBubble — cause-specific retry gating and copy (reply-window-ux-harmonization Unit 4)", () => {
  it("disables and relabels retry as 'Reintento no disponible' when the failure code is window_expired", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "window_expired" },
      { onRetry: () => {} },
    );
    expect(html).toContain("Reintento no disponible");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Reintentar");
  });

  it("shows the window_expired cause in the accessible name", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "window_expired" },
      { onRetry: () => {} },
    );
    expect(html).toContain("24 horas");
  });

  it.each([
    ["rate_limit", "límite"],
    ["invalid_recipient", "número de destino"],
    ["unknown", "No se pudo entregar"],
  ])(
    "keeps retry enabled with cause-specific copy for failureCode %s",
    (code, expectedFragment) => {
      const html = renderBubble(
        { ...failedBotMessage, failureCode: code },
        { onRetry: () => {} },
      );
      expect(html).toContain("Reintentar");
      expect(html).not.toContain("disabled");
      expect(html).toContain(expectedFragment);
    },
  );

  it("shows the connection fix as visible cause text for an auth failure while keeping retry enabled", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "auth" },
      { onRetry: () => {} },
    );
    expect(html).toContain("revisa la conexión con WhatsApp");
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("disabled");
  });

  it("treats an unrecognized/invalid DB failure code as unknown (still retryable)", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "some-legacy-value" },
      { onRetry: () => {} },
    );
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("disabled");
  });

  it("still renders retry-related copy for a persisted failed message even without failureCode set", () => {
    const html = renderBubble(failedBotMessage, { onRetry: () => {} });
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("disabled");
  });

  it("does not render retry copy for a message that is not failed", () => {
    const html = renderBubble(
      { ...baseMessage, role: "assistant", sentBy: "bot", status: "sent" },
      { onRetry: () => {} },
    );
    expect(html).not.toContain("Reintentar");
    expect(html).not.toContain("Reintento no disponible");
  });
});

describe("MessageBubble — visible failure cause (retry-duplicate-and-visible-cause defect 2)", () => {
  it("renders the failure cause as visible bubble text, not only inside the button's title/aria-label", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit" },
      { onRetry: () => {} },
    );
    // A match outside any tag's attribute quotes proves the cause is real
    // rendered text content, not just an attribute value a mobile user
    // (no hover) would never see.
    expect(html).toMatch(/>[^<]*límite[^<]*</);
  });

  it("does not repeat the cause string as both visible text and the button's own aria-label", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit" },
      { onRetry: () => {} },
    );
    const occurrences = html.split("límite").length - 1;
    expect(occurrences).toBe(1);
  });

  it("restores the timestamp on a failed bubble instead of losing it to the retry row", () => {
    const createdAt = new Date("2026-09-15T10:30:00.000Z").toISOString();
    const expectedTime = new Date(createdAt).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit", createdAt },
      { onRetry: () => {} },
    );
    expect(html).toContain(expectedTime);
  });
});

describe("MessageBubble — already-retried state (retry-duplicate-and-visible-cause defect 1)", () => {
  it("disables the retry action and labels it 'Ya reintentado' once the message was already retried successfully", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit", retried: true },
      { onRetry: () => {} },
    );
    expect(html).toContain("Ya reintentado");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Reintentar<");
  });

  it("keeps the original failure cause visible even once already retried", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit", retried: true },
      { onRetry: () => {} },
    );
    expect(html).toMatch(/>[^<]*límite[^<]*</);
  });
});

describe("MessageBubble — retry in-flight state (reply-window-ux-harmonization Unit 4)", () => {
  it("disables the retry button and shows an in-flight label while retrying is true", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit" },
      { onRetry: () => {}, retrying: true },
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Reintentando");
    expect(html).not.toContain("Reintentar<");
  });

  it("re-enables the retry button when retrying is false (settled)", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "rate_limit" },
      { onRetry: () => {}, retrying: false },
    );
    expect(html).not.toContain("disabled");
    expect(html).toContain("Reintentar");
  });

  it("keeps window_expired disabled regardless of the retrying flag", () => {
    const html = renderBubble(
      { ...failedBotMessage, failureCode: "window_expired" },
      { onRetry: () => {}, retrying: false },
    );
    expect(html).toContain("disabled");
  });
});
