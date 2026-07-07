import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { isAdmin } from "@/lib/scope";
import { cleanupOwnershipFixtures, createTestUser } from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
  requireAdmin: async () => {
    const user = await getSessionUser();
    return user && isAdmin(user) ? user : null;
  },
}));

const inviteUserByEmail = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { inviteUserByEmail } } }),
}));

const signInWithOtp = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

function buildRequest(): NextRequest {
  return new NextRequest("https://example.com/api/admin/clients/x/resend-invite", {
    method: "POST",
  });
}

describe("POST /api/admin/clients/[id]/resend-invite", () => {
  let admin: User;
  const userIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestUser("resend-admin", "admin");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([admin.id, ...userIds]);
  });

  it("returns 404 for a non-admin caller", async () => {
    const other = await createTestUser("resend-nonadmin");
    userIds.push(other.id);
    getSessionUser.mockResolvedValueOnce(other);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: other.id }) });

    expect(res.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown client id", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: randomUUID() }) });

    expect(res.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("returns 404 for a user that isn't a client (e.g. another admin)", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const otherAdmin = await createTestUser("resend-other-admin", "admin");
    userIds.push(otherAdmin.id);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: otherAdmin.id }) });

    expect(res.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("re-invites when the invite hasn't been accepted yet", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const client = await createTestUser("resend-fresh");
    userIds.push(client.id);
    inviteUserByEmail.mockResolvedValueOnce({ data: { user: { id: client.id } }, error: null });
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: client.id }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, method: "invite" });
    expect(inviteUserByEmail).toHaveBeenCalledWith(client.email);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("falls back to a magic-link OTP when the invite fails because the client already registered", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const client = await createTestUser("resend-registered");
    userIds.push(client.id);
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: null },
      error: {
        message: "A user with this email address has already been registered",
        status: 422,
        code: "email_exists",
      },
    });
    signInWithOtp.mockResolvedValueOnce({ data: {}, error: null });
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: client.id }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, method: "magiclink" });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: client.email,
      options: { shouldCreateUser: false },
    });
  });

  it("returns 400 with the provider error when the invite fails for another reason", async () => {
    signInWithOtp.mockClear();
    getSessionUser.mockResolvedValueOnce(admin);
    const client = await createTestUser("resend-other-error");
    userIds.push(client.id);
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Rate limit exceeded", status: 429 },
    });
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: client.id }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Rate limit exceeded");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns 400 with the provider error when the OTP fallback itself fails", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const client = await createTestUser("resend-otp-fail");
    userIds.push(client.id);
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "already registered", status: 422 },
    });
    signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "OTP send failed" },
    });
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: client.id }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("OTP send failed");
  });
});
