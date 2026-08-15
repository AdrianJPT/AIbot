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

function renderBubble(message: RenderableMessage) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MessageBubble message={message} />
    </QueryClientProvider>,
  );
}

describe("MessageBubble — inline payment card (tasks #568 PR4)", () => {
  it("renders no payment card for an ordinary message", () => {
    const html = renderBubble(baseMessage);
    expect(html).not.toContain("Cargando pago");
  });

  it("renders the inline payment card for a message linked to a PaymentProof", () => {
    const html = renderBubble({ ...baseMessage, paymentSessionId: "session-1" });
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
