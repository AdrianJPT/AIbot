import { describe, expect, it } from "vitest";
import {
  appointmentScope,
  businessScope,
  conversationScope,
  isAdmin,
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
