import { describe, expect, it } from "vitest";
import { PaymentSessionStatus } from "@prisma/client";
import {
  DEFAULT_AUTONOMY_ROUNDS,
  DEFAULT_EXPIRY_HOURS,
  IllegalTransitionError,
  applyTransition,
  isSessionExpired,
  resolveExpiresAt,
} from "../state-machine";

const S = PaymentSessionStatus;

describe("applyTransition — legal transitions", () => {
  it("moves awaiting_proof to analyzing on proof_received", () => {
    const result = applyTransition(
      { status: S.awaiting_proof, autonomyRounds: DEFAULT_AUTONOMY_ROUNDS },
      "proof_received",
    );
    expect(result.status).toBe(S.analyzing);
    expect(result.autonomyRounds).toBe(DEFAULT_AUTONOMY_ROUNDS);
    expect(result.audit.action).toBe(
      "transition:awaiting_proof->analyzing",
    );
  });

  it("moves analyzing to ready_to_confirm on verdict_ready", () => {
    const result = applyTransition(
      { status: S.analyzing, autonomyRounds: DEFAULT_AUTONOMY_ROUNDS },
      "verdict_ready",
    );
    expect(result.status).toBe(S.ready_to_confirm);
  });

  it("moves analyzing to customer_action on needs_customer_action", () => {
    const result = applyTransition(
      { status: S.analyzing, autonomyRounds: DEFAULT_AUTONOMY_ROUNDS },
      "needs_customer_action",
    );
    expect(result.status).toBe(S.customer_action);
  });

  it("moves customer_action back to analyzing and consumes one autonomy round", () => {
    const result = applyTransition(
      { status: S.customer_action, autonomyRounds: 3 },
      "customer_responded",
    );
    expect(result.status).toBe(S.analyzing);
    expect(result.autonomyRounds).toBe(2);
  });

  it("moves ready_to_confirm to confirmed on owner_confirmed", () => {
    const result = applyTransition(
      { status: S.ready_to_confirm, autonomyRounds: 3 },
      "owner_confirmed",
    );
    expect(result.status).toBe(S.confirmed);
    expect(result.audit.action).toBe(
      "transition:ready_to_confirm->confirmed",
    );
  });

  it("moves ready_to_confirm to rejected on owner_rejected", () => {
    const result = applyTransition(
      { status: S.ready_to_confirm, autonomyRounds: 3 },
      "owner_rejected",
    );
    expect(result.status).toBe(S.rejected);
  });

  it.each([
    S.awaiting_proof,
    S.analyzing,
    S.customer_action,
    S.ready_to_confirm,
  ])("moves open status %s to expired on session_expired", (status) => {
    const result = applyTransition(
      { status, autonomyRounds: 3 },
      "session_expired",
    );
    expect(result.status).toBe(S.expired);
    expect(result.audit.action).toBe(`transition:${status}->expired`);
  });
});

describe("applyTransition — autonomy budget boundary", () => {
  it("allows autonomy_exhausted from analyzing only once rounds are used up", () => {
    const result = applyTransition(
      { status: S.analyzing, autonomyRounds: 0 },
      "autonomy_exhausted",
    );
    expect(result.status).toBe(S.escalated);
    expect(result.audit.detail).toEqual({ reason: "autonomy_exhausted" });
  });

  it("rejects autonomy_exhausted while rounds remain", () => {
    expect(() =>
      applyTransition(
        { status: S.analyzing, autonomyRounds: 1 },
        "autonomy_exhausted",
      ),
    ).toThrow(IllegalTransitionError);
  });

  it("three correction rounds exhaust the default budget down to zero", () => {
    let session = { status: S.customer_action, autonomyRounds: DEFAULT_AUTONOMY_ROUNDS };
    for (let i = 0; i < DEFAULT_AUTONOMY_ROUNDS; i++) {
      const next = applyTransition(session, "customer_responded");
      session = { status: S.customer_action, autonomyRounds: next.autonomyRounds };
    }
    expect(session.autonomyRounds).toBe(0);

    const escalation = applyTransition(
      { status: S.analyzing, autonomyRounds: session.autonomyRounds },
      "autonomy_exhausted",
    );
    expect(escalation.status).toBe(S.escalated);
  });

  it("escalates a customer refusal from customer_action regardless of remaining rounds", () => {
    const result = applyTransition(
      { status: S.customer_action, autonomyRounds: 2 },
      "customer_refused",
    );
    expect(result.status).toBe(S.escalated);
    expect(result.audit.detail).toEqual({ reason: "customer_refused" });
  });
});

describe("applyTransition — illegal transitions throw", () => {
  it("rejects an event that has no mapping for the current status", () => {
    expect(() =>
      applyTransition(
        { status: S.awaiting_proof, autonomyRounds: 3 },
        "owner_confirmed",
      ),
    ).toThrow(IllegalTransitionError);
  });

  it("rejects any transition attempted from a terminal status", () => {
    for (const status of [S.confirmed, S.rejected, S.escalated, S.expired]) {
      expect(() =>
        applyTransition({ status, autonomyRounds: 3 }, "session_expired"),
      ).toThrow(IllegalTransitionError);
    }
  });

  it("includes the offending status and event in the error message", () => {
    try {
      applyTransition(
        { status: S.confirmed, autonomyRounds: 3 },
        "proof_received",
      );
      throw new Error("expected applyTransition to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError);
      expect((err as Error).message).toContain("confirmed");
      expect((err as Error).message).toContain("proof_received");
    }
  });
});

describe("resolveExpiresAt / isSessionExpired — 72h expiry", () => {
  it("defaults to 72 hours from the given creation time", () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    const expiresAt = resolveExpiresAt(createdAt);
    expect(expiresAt.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    expect(DEFAULT_EXPIRY_HOURS).toBe(72);
  });

  it("honors a custom expiry window in hours", () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    const expiresAt = resolveExpiresAt(createdAt, 24);
    expect(expiresAt.toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("reports a session as not expired before its expiresAt", () => {
    const expiresAt = new Date("2026-08-04T00:00:00.000Z");
    const now = new Date("2026-08-03T23:59:59.000Z");
    expect(isSessionExpired(expiresAt, now)).toBe(false);
  });

  it("reports a session as expired once now is past expiresAt", () => {
    const expiresAt = new Date("2026-08-04T00:00:00.000Z");
    const now = new Date("2026-08-04T00:00:01.000Z");
    expect(isSessionExpired(expiresAt, now)).toBe(true);
  });

  it("treats a null expiresAt as never expired", () => {
    expect(isSessionExpired(null, new Date())).toBe(false);
  });
});
