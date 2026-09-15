import { describe, expect, it } from "vitest";
import { markMessageRetried } from "../mark-message-retried";
import type { MessagesPage } from "@/features/conversations/types";

function page(messages: MessagesPage["messages"]): MessagesPage {
  return { messages, nextCursor: null };
}

describe("markMessageRetried", () => {
  it("flips retried:true on the matching message, leaving others in the page untouched", () => {
    const pages = [
      page([
        {
          id: "a",
          role: "assistant",
          content: "x",
          mediaType: "text",
          sentBy: "bot",
          status: "failed",
          createdAt: "t",
        },
        {
          id: "b",
          role: "assistant",
          content: "y",
          mediaType: "text",
          sentBy: "bot",
          status: "sent",
          createdAt: "t",
        },
      ]),
    ];

    const result = markMessageRetried(pages, "a");

    expect(result[0].messages.find((m) => m.id === "a")?.retried).toBe(true);
    expect(
      result[0].messages.find((m) => m.id === "b")?.retried,
    ).toBeUndefined();
  });

  it("finds the matching message across multiple pages", () => {
    const pages = [
      page([
        {
          id: "a",
          role: "assistant",
          content: "x",
          mediaType: "text",
          sentBy: "bot",
          status: "failed",
          createdAt: "t",
        },
      ]),
      page([
        {
          id: "b",
          role: "assistant",
          content: "y",
          mediaType: "text",
          sentBy: "bot",
          status: "failed",
          createdAt: "t",
        },
      ]),
    ];

    const result = markMessageRetried(pages, "b");

    expect(result[0].messages[0].retried).toBeUndefined();
    expect(result[1].messages[0].retried).toBe(true);
  });
});
