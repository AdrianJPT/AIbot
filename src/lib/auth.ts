import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/scope";
import type { User } from "@prisma/client";

/**
 * Reads the Supabase session for the current request and upserts the
 * corresponding `User` row on first sight. This is the ONLY entry point
 * routes/pages should use to determine the current user — do not read the
 * Supabase session directly elsewhere, and do not cache the result across
 * requests.
 *
 * Returns `null` when there is no authenticated session.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser || !authUser.email) return null;

  const metadata = authUser.user_metadata ?? {};
  const name =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    null;
  const avatarUrl =
    (metadata.avatar_url as string | undefined) ??
    (metadata.picture as string | undefined) ??
    null;

  const user = await prisma.user.upsert({
    where: { id: authUser.id },
    create: {
      id: authUser.id,
      email: authUser.email,
      name,
      avatarUrl,
    },
    update: {
      email: authUser.email,
      ...(name != null && { name }),
      ...(avatarUrl != null && { avatarUrl }),
    },
  });

  return user;
}

/**
 * Like `getSessionUser`, but also requires the "admin" role. Returns `null`
 * both when there is no session and when the caller isn't an admin, so
 * callers can respond uniformly (redirect for pages, 404 JSON for API
 * routes) without leaking whether a non-admin is even authenticated.
 */
export async function requireAdmin(): Promise<User | null> {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) return null;
  return user;
}
