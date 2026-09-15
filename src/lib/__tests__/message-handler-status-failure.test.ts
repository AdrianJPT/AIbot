import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";
import type { ChannelConnection, NormalizedEvent } from "../channels/contracts";

const findFirstPhoneNumber = vi.fn();
const findFirstMessage = vi.fn();
const messageUpdate = vi.fn();
const eventLogCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    phoneNumber: {
      findFirst: (...args: unknown[]) => findFirstPhoneNumber(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => findFirstMessage(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
    },
    eventLog: { create: (...args: unknown[]) => eventLogCreate(...args) },
  },
}));

const { processNormalizedEvents } = await import("../message-handler");

const business = buildBusiness();
const phoneNumber = buildPhoneNumber();

function connection(): ChannelConnection {
  return {
    id: phoneNumber.id,
    businessId: business.id,
    channel: "whatsapp",
    provider: "meta",
    externalId: phoneNumber.phoneNumberId,
    isActive: true,
  };
}

/**
 * Builds a normalized status event, matching what
 * `channels/whatsapp.ts`'s `normalizeStatus` produces post-3b.8: `failure`
 * present only when the caller supplies it.
 */
function statusEvent(
  overrides: Partial<Extract<NormalizedEvent, { kind: "status" }>> = {},
): NormalizedEvent {
  return {
    kind: "status",
    channel: "whatsapp",
    tenantId: business.id,
    connectionId: phoneNumber.id,
    eventId: "wamid.out_1",
    externalMessageId: "wamid.out_1",
    status: "delivered",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business });
  findFirstMessage.mockResolvedValue({ id: "msg_out_1" });
  messageUpdate.mockResolvedValue({});
  eventLogCreate.mockResolvedValue({});
});

describe("processNormalizedEvents / handleStatusUpdate — failure persistence", () => {
  it("persists the classified failureCode and failureDetail only when the status is failed", async () => {
    await processNormalizedEvents(connection(), [
      statusEvent({
        status: "failed",
        failure: {
          code: "window_expired",
          detail: "131047 Re-engagement message",
        },
      }),
    ]);

    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: {
        status: "failed",
        failureCode: "window_expired",
        failureDetail: "131047 Re-engagement message",
      },
    });
  });

  it("classifies a failed status with no failure data as unknown with a null detail", async () => {
    await processNormalizedEvents(connection(), [
      statusEvent({ status: "failed" }),
    ]);

    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { status: "failed", failureCode: "unknown", failureDetail: null },
    });
  });

  it("never touches or clears failureCode/failureDetail on a non-failed status update", async () => {
    await processNormalizedEvents(connection(), [
      statusEvent({ status: "delivered" }),
    ]);

    // Exact match proves the update's `data` carries no failureCode/failureDetail
    // key at all — a partial Prisma update only modifies specified fields, so
    // omitting the keys is what guarantees an existing failure reason survives
    // a later non-failed status (e.g. a stale/reordered webhook delivery).
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { status: "delivered" },
    });
  });
});
