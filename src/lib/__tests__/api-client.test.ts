import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppointment } from "@/features/appointments/api";
import { createBusiness } from "@/features/businesses/api";
import { requestJson } from "@/lib/api-client";

describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the URL and RequestInit and returns typed JSON", async () => {
    const payload = { id: "business-1", active: true };
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme" }),
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestJson<typeof payload>("/api/businesses", init);

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/businesses", init);
  });

  it("rejects when a successful response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(requestJson("/api/events")).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it("propagates fetch rejections unchanged", async () => {
    const networkError = new TypeError("fetch failed");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(networkError),
    );

    await expect(requestJson("/api/settings")).rejects.toBe(networkError);
  });

  it("uses a non-empty string error from a non-success JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "server message" }), {
          status: 422,
        }),
      ),
    );

    await expect(requestJson("/api/appointments")).rejects.toThrow(
      "server message",
    );
  });

  it.each([
    ["absent", {}],
    ["null", { error: null }],
    ["object", { error: { message: "nested" } }],
    ["array", { error: ["nested"] }],
    ["numeric", { error: 409 }],
    ["empty string", { error: "" }],
  ])("uses the default fallback for an %s error value", async (_, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 400,
        }),
      ),
    );

    await expect(requestJson("/api/conversations")).rejects.toThrow("Error");
  });

  it.each([
    ["malformed", "{"],
    ["empty", undefined],
  ])("uses the default fallback for an %s error body", async (_, body) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { status: 500 })),
    );

    await expect(requestJson("/api/credentials")).rejects.toThrow("Error");
  });

  it("uses a caller-provided fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: null }), {
          status: 500,
        }),
      ),
    );

    await expect(
      requestJson("/api/businesses", undefined, "Error al guardar"),
    ).rejects.toThrow("Error al guardar");
  });
});

describe("feature API fallbacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the default fallback for appointment requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 500,
        }),
      ),
    );

    await expect(
      createAppointment({
        businessId: "business-1",
        customerPhone: "+15551234567",
        customerName: "Ada",
        service: "Consultation",
        date: "2026-08-06",
        time: "15:00",
        notes: null,
      }),
    ).rejects.toThrow("Error");
  });

  it("preserves the businesses custom fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 500,
        }),
      ),
    );

    await expect(
      createBusiness({
        name: "Acme",
        phoneNumberId: null,
        displayPhone: null,
        whatsappToken: "",
        ownerId: "owner-1",
        systemPrompt: "Be helpful",
        welcomeMessage: "Welcome",
        businessInfo: {},
        knowledgeDoc: null,
        model: "gpt-4.1-mini",
        visionModel: "gpt-4.1-mini",
        audioModel: "gpt-4o-mini-transcribe",
        maxHistoryMessages: 20,
        replyWindowMs: 5_000,
        isActive: true,
        aiCredentialId: null,
        whatsappCredentialId: null,
      }),
    ).rejects.toThrow("Error al guardar");
  });
});
