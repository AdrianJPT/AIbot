import { describe, expect, it } from "vitest";
import {
  appointmentScope,
  businessScope,
  conversationScope,
  eventLogScope,
  isAdmin,
  messageScope,
  paymentSessionScope,
  phoneNumberScope,
} from "@/lib/scope";

const admin = { id: "admin-1", role: "admin" };
const client = { id: "client-1", role: "client" };

describe("isAdmin", () => {
  it("is true for role='admin'", () => {
    expect(isAdmin(admin)).toBe(true);
  });

  it("is false for role='client'", () => {
    expect(isAdmin(client)).toBe(false);
  });
});

describe("businessScope", () => {
  it("returns no filter for admins", () => {
    expect(businessScope(admin)).toEqual({});
  });

  it("scopes by ownerId for clients", () => {
    expect(businessScope(client)).toEqual({ ownerId: client.id });
  });
});

describe("conversationScope", () => {
  it("returns no filter for admins", () => {
    expect(conversationScope(admin)).toEqual({});
  });

  it("scopes through business.ownerId for clients", () => {
    expect(conversationScope(client)).toEqual({
      business: { ownerId: client.id },
    });
  });
});

describe("appointmentScope", () => {
  it("returns no filter for admins", () => {
    expect(appointmentScope(admin)).toEqual({});
  });

  it("scopes through business.ownerId for clients", () => {
    expect(appointmentScope(client)).toEqual({
      business: { ownerId: client.id },
    });
  });
});

describe("paymentSessionScope", () => {
  it("returns no filter for admins", () => {
    expect(paymentSessionScope(admin)).toEqual({});
  });

  it("scopes through business.ownerId for clients", () => {
    expect(paymentSessionScope(client)).toEqual({
      business: { ownerId: client.id },
    });
  });
});

describe("messageScope", () => {
  it("returns no filter for admins", () => {
    expect(messageScope(admin)).toEqual({});
  });

  it("scopes through conversation.business.ownerId for clients", () => {
    expect(messageScope(client)).toEqual({
      conversation: { business: { ownerId: client.id } },
    });
  });
});

describe("phoneNumberScope", () => {
  it("returns no filter for admins", () => {
    expect(phoneNumberScope(admin)).toEqual({});
  });

  it("scopes through business.ownerId for clients", () => {
    expect(phoneNumberScope(client)).toEqual({
      business: { ownerId: client.id },
    });
  });
});

describe("eventLogScope", () => {
  const ownedBusinessIds = ["biz-1", "biz-2"];

  it("returns no filter for admins", () => {
    expect(eventLogScope(admin, ownedBusinessIds)).toEqual({});
  });

  it("scopes clients to owned businessIds OR a null businessId", () => {
    expect(eventLogScope(client, ownedBusinessIds)).toEqual({
      OR: [{ businessId: { in: ownedBusinessIds } }, { businessId: null }],
    });
  });

  it("scopes a client with no owned businesses to null businessId only", () => {
    expect(eventLogScope(client, [])).toEqual({
      OR: [{ businessId: { in: [] } }, { businessId: null }],
    });
  });
});
