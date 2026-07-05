import type { Prisma, User } from "@prisma/client";

type ScopedUser = Pick<User, "id" | "role">;

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
export function conversationScope(user: ScopedUser): Prisma.ConversationWhereInput {
  return isAdmin(user) ? {} : { business: { ownerId: user.id } };
}

/**
 * Same as `businessScope`, scoped through the `Appointment -> Business`
 * relation.
 */
export function appointmentScope(user: ScopedUser): Prisma.AppointmentWhereInput {
  return isAdmin(user) ? {} : { business: { ownerId: user.id } };
}
