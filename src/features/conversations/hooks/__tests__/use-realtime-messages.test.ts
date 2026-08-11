import { describe, expect, it } from "vitest";
import {
  buildConversationChangeFilter,
  shouldOpenConversationChannel,
} from "@/features/conversations/hooks/use-realtime-messages";

describe("buildConversationChangeFilter", () => {
  it("returns no filter (unfiltered) when listScope is omitted", () => {
    expect(buildConversationChangeFilter(undefined)).toBeUndefined();
  });

  it("returns no filter for an admin scope (admins stay unfiltered by design)", () => {
    expect(
      buildConversationChangeFilter({ admin: true, businessIds: ["biz-1"] }),
    ).toBeUndefined();
  });

  it("returns a businessId=in.(...) filter for a client scope with one business", () => {
    expect(
      buildConversationChangeFilter({ admin: false, businessIds: ["biz-1"] }),
    ).toBe("businessId=in.(biz-1)");
  });

  it("joins multiple business ids for a client scope with several businesses (triangulation)", () => {
    expect(
      buildConversationChangeFilter({
        admin: false,
        businessIds: ["biz-1", "biz-2", "biz-3"],
      }),
    ).toBe("businessId=in.(biz-1,biz-2,biz-3)");
  });
});

describe("shouldOpenConversationChannel", () => {
  it("returns false when listScope is omitted (thread container: no duplicate channel)", () => {
    expect(shouldOpenConversationChannel(undefined)).toBe(false);
  });

  it("returns true when listScope is provided (list pane: owns the channel)", () => {
    expect(
      shouldOpenConversationChannel({ admin: false, businessIds: ["biz-1"] }),
    ).toBe(true);
  });
});
