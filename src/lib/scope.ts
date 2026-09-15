import type { Prisma, User } from "@prisma/client";

// Exported so downstream modules (e.g. `src/lib/analytics/repository.ts`)
// can type their own `user` parameter against the same minimal shape
// instead of requiring a full Prisma `User`.
export type ScopedUser = Pick<User, "id" | "role">;

/**
 * True when the user has the "admin" role. Admins are the product owner's
 * account(s) and see data across every client — regular ("client") users
 * only ever see their own businesses/conversations/appointments. Only needs
 * `role`, so it also works on the trimmed-down user shape passed to
 * client components (e.g. the sidebar), not just full Prisma `User` rows.
 */
export function isAdmin(user: Pick<User, "role">): boolean {
  return user.role === "admin";
}

/**
 * Prisma `where` filter scoping `Business` rows to the caller: no filter for
 * admins (see every business), `ownerId` match for regular clients. Spread
 * this into a `where` clause alongside any other filters.
 */
export function businessScope(user: ScopedUser): Prisma.BusinessWhereInput {
  return isAdmin(user) ? {} : { ownerId: user.id };
}

/**
 * Same as `businessScope`, scoped through the `Conversation -> Business`
 * relation.
 */
export function conversationScope(
  user: ScopedUser,
): Prisma.ConversationWhereInput {
  return isAdmin(user) ? {} : { business: { ownerId: user.id } };
}

/**
 * Same as `businessScope`, scoped through the `Appointment -> Business`
 * relation.
 */
export function appointmentScope(
  user: ScopedUser,
): Prisma.AppointmentWhereInput {
  return isAdmin(user) ? {} : { business: { ownerId: user.id } };
}

/**
 * Same as `businessScope`, scoped through the `PaymentSession -> Business`
 * relation — see docs/payment-verification-engine.md's "Tenant isolation"
 * requirement and design decision 8.
 */
export function paymentSessionScope(
  user: ScopedUser,
): Prisma.PaymentSessionWhereInput {
  return isAdmin(user) ? {} : { business: { ownerId: user.id } };
}

/**
 * Same as `businessScope`, scoped through the `Message -> Conversation ->
 * Business` relation. Used by operational-analytics' delivery-health and
 * volume queries.
 */
export function messageScope(user: ScopedUser): Prisma.MessageWhereInput {
  return isAdmin(user)
    ? {}
    : { conversation: { business: { ownerId: user.id } } };
}

/**
 * `EventLog.businessId` is nullable (see schema.prisma) — some events (e.g.
 * auth failures before a business is resolved) carry no businessId. Admins
 * see everything; clients see events for a business they own OR events with
 * no business at all, matching the accepted OR-array pattern already used
 * by `src/app/(app)/page.tsx`'s dashboard error count. A relation filter
 * (`business: { ownerId }`) would INNER-JOIN and silently drop the
 * `businessId: null` rows the dashboard already counts, which is why this
 * takes the caller's precomputed owned business ids instead of deriving
 * them itself.
 */
export function eventLogScope(
  user: ScopedUser,
  ownedBusinessIds: string[],
): Prisma.EventLogWhereInput {
  return isAdmin(user)
    ? {}
    : {
        OR: [{ businessId: { in: ownedBusinessIds } }, { businessId: null }],
      };
}
