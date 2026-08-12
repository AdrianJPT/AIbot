import { PaymentSessionStatus } from "@prisma/client";

/**
 * Payment verification state machine — the deterministic core described in
 * docs/payment-verification-engine.md decision 1 and 3. This module is a
 * pure function over plain data: no Prisma client, no I/O. Callers (slice 2)
 * are responsible for loading a `PaymentSession`, calling `applyTransition`,
 * persisting the returned status/autonomyRounds, and writing the returned
 * `audit` descriptor as a `PaymentAuditEntry` row — this module never talks
 * to the database itself, so its correctness can be pinned with unit tests
 * alone.
 *
 * Transition graph (statuses are the Prisma `PaymentSessionStatus` enum):
 *
 *   awaiting_proof --proof_received--> analyzing
 *   analyzing --verdict_ready--> ready_to_confirm
 *   analyzing --needs_customer_action--> customer_action
 *   customer_action --customer_responded--> analyzing (consumes one autonomy round)
 *   analyzing --autonomy_exhausted--> escalated (only once autonomyRounds <= 0)
 *   customer_action --customer_refused--> escalated
 *   ready_to_confirm --owner_confirmed--> confirmed
 *   ready_to_confirm --owner_rejected--> rejected
 *   {awaiting_proof, analyzing, customer_action, ready_to_confirm} --session_expired--> expired
 *
 * confirmed, rejected, escalated and expired are terminal: no event is legal
 * from them. Anything not in the table above throws `IllegalTransitionError`
 * — there is no default/fallthrough transition.
 */

export const DEFAULT_AUTONOMY_ROUNDS = 3;
export const DEFAULT_EXPIRY_HOURS = 72;

export type PaymentTransitionEvent =
  | "proof_received"
  | "verdict_ready"
  | "needs_customer_action"
  | "customer_responded"
  | "autonomy_exhausted"
  | "customer_refused"
  | "owner_confirmed"
  | "owner_rejected"
  | "session_expired";

export type TransitionAudit = {
  action: string;
  detail?: Record<string, unknown>;
};

export type TransitionInput = {
  status: PaymentSessionStatus;
  autonomyRounds: number;
};

export type TransitionResult = {
  status: PaymentSessionStatus;
  autonomyRounds: number;
  audit: TransitionAudit;
};

export class IllegalTransitionError extends Error {
  constructor(status: PaymentSessionStatus, event: PaymentTransitionEvent) {
    super(
      `Illegal payment session transition: event "${event}" is not valid from status "${status}"`,
    );
    this.name = "IllegalTransitionError";
  }
}

const OPEN_STATUSES: readonly PaymentSessionStatus[] = [
  PaymentSessionStatus.awaiting_proof,
  PaymentSessionStatus.analyzing,
  PaymentSessionStatus.customer_action,
  PaymentSessionStatus.ready_to_confirm,
];

/**
 * Applies one event to a session's current (status, autonomyRounds) pair and
 * returns the next pair plus an audit descriptor. Never mutates its input.
 * Throws `IllegalTransitionError` for any event not legal from the given
 * status, including every event attempted from a terminal status.
 */
export function applyTransition(
  input: TransitionInput,
  event: PaymentTransitionEvent,
): TransitionResult {
  const { status, autonomyRounds } = input;

  switch (event) {
    case "proof_received":
      return requireStatus(status, PaymentSessionStatus.awaiting_proof, event, () =>
        moveTo(PaymentSessionStatus.analyzing, autonomyRounds, status),
      );

    case "verdict_ready":
      return requireStatus(status, PaymentSessionStatus.analyzing, event, () =>
        moveTo(PaymentSessionStatus.ready_to_confirm, autonomyRounds, status),
      );

    case "needs_customer_action":
      return requireStatus(status, PaymentSessionStatus.analyzing, event, () =>
        moveTo(PaymentSessionStatus.customer_action, autonomyRounds, status),
      );

    case "customer_responded":
      return requireStatus(status, PaymentSessionStatus.customer_action, event, () =>
        moveTo(
          PaymentSessionStatus.analyzing,
          Math.max(0, autonomyRounds - 1),
          status,
        ),
      );

    case "autonomy_exhausted": {
      if (status !== PaymentSessionStatus.analyzing || autonomyRounds > 0) {
        throw new IllegalTransitionError(status, event);
      }
      return moveTo(PaymentSessionStatus.escalated, autonomyRounds, status, {
        reason: "autonomy_exhausted",
      });
    }

    case "customer_refused":
      return requireStatus(status, PaymentSessionStatus.customer_action, event, () =>
        moveTo(PaymentSessionStatus.escalated, autonomyRounds, status, {
          reason: "customer_refused",
        }),
      );

    case "owner_confirmed":
      return requireStatus(status, PaymentSessionStatus.ready_to_confirm, event, () =>
        moveTo(PaymentSessionStatus.confirmed, autonomyRounds, status),
      );

    case "owner_rejected":
      return requireStatus(status, PaymentSessionStatus.ready_to_confirm, event, () =>
        moveTo(PaymentSessionStatus.rejected, autonomyRounds, status),
      );

    case "session_expired": {
      if (!OPEN_STATUSES.includes(status)) {
        throw new IllegalTransitionError(status, event);
      }
      return moveTo(PaymentSessionStatus.expired, autonomyRounds, status);
    }

    default: {
      // Exhaustiveness guard — a new PaymentTransitionEvent variant without a
      // case above is a compile error here, not a silent runtime fallthrough.
      const _exhaustive: never = event;
      throw new IllegalTransitionError(status, _exhaustive);
    }
  }
}

function requireStatus(
  actual: PaymentSessionStatus,
  expected: PaymentSessionStatus,
  event: PaymentTransitionEvent,
  onMatch: () => TransitionResult,
): TransitionResult {
  if (actual !== expected) {
    throw new IllegalTransitionError(actual, event);
  }
  return onMatch();
}

function moveTo(
  next: PaymentSessionStatus,
  autonomyRounds: number,
  from: PaymentSessionStatus,
  detail?: Record<string, unknown>,
): TransitionResult {
  return {
    status: next,
    autonomyRounds,
    audit: {
      action: `transition:${from}->${next}`,
      ...(detail ? { detail } : {}),
    },
  };
}

/**
 * The default 72h expiry window (decision 3/9), computed relative to a
 * caller-supplied `createdAt` rather than `Date.now()` inside the schema, so
 * it stays a deterministic, testable function — see
 * `PaymentSession.expiresAt`'s comment in schema.prisma for why this isn't a
 * Prisma `@default`.
 */
export function resolveExpiresAt(
  createdAt: Date,
  hours: number = DEFAULT_EXPIRY_HOURS,
): Date {
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

/** A session with no `expiresAt` set is treated as never expiring. */
export function isSessionExpired(
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return now.getTime() > expiresAt.getTime();
}
