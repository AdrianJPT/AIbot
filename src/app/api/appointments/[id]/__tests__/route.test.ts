import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Appointment, Business, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/appointments/x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/appointments/[id]", () => {
  let owner: User;
  let other: User;
  let ownBusiness: Business & { phoneNumbers: { id: string }[] };
  let foreignBusiness: Business & { phoneNumbers: { id: string }[] };
  let appointment: Appointment;
  let foreignAppointment: Appointment;

  beforeAll(async () => {
    owner = await createTestUser("appt-patch-owner");
    other = await createTestUser("appt-patch-other");
    ownBusiness = await createTestBusiness(owner.id, "patch-own");
    foreignBusiness = await createTestBusiness(other.id, "patch-foreign");
    const ownConversation = await createTestConversation(
      ownBusiness.id,
      "patch-own-1",
    );
    const foreignConversation = await createTestConversation(
      foreignBusiness.id,
      "patch-foreign-1",
    );

    appointment = await prisma.appointment.create({
      data: {
        businessId: ownBusiness.id,
        conversationId: ownConversation.id,
        customerPhone: ownConversation.customerPhone,
        customerName: "Cliente Test",
        service: "Corte de pelo",
        date: "2026-08-01",
        time: "10:00",
      },
    });
    foreignAppointment = await prisma.appointment.create({
      data: {
        businessId: foreignBusiness.id,
        conversationId: foreignConversation.id,
        customerPhone: foreignConversation.customerPhone,
        customerName: "Cliente Ajeno",
        service: "Corte de pelo",
        date: "2026-08-01",
        time: "11:00",
      },
    });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildRequest({ status: "confirmed" }), {
      params: Promise.resolve({ id: appointment.id }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the appointment id belongs to another tenant", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildRequest({ status: "confirmed" }), {
      params: Promise.resolve({ id: foreignAppointment.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when status is outside the allowlist and leaves the row unmodified", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildRequest({ status: "completed" }), {
      params: Promise.resolve({ id: appointment.id }),
    });
    expect(res.status).toBe(400);

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(row.status).toBe("pending");
  });

  it("returns 400 when a field has a non-string/non-null type", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildRequest({ notes: 12345 }), {
      params: Promise.resolve({ id: appointment.id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 and transitions status to confirmed then cancelled", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const confirmRes = await PATCH(buildRequest({ status: "confirmed" }), {
      params: Promise.resolve({ id: appointment.id }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmedBody = await confirmRes.json();
    expect(confirmedBody.status).toBe("confirmed");

    getSessionUser.mockResolvedValueOnce(owner);
    const cancelRes = await PATCH(buildRequest({ status: "cancelled" }), {
      params: Promise.resolve({ id: appointment.id }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelledBody = await cancelRes.json();
    expect(cancelledBody.status).toBe("cancelled");
  });
});
