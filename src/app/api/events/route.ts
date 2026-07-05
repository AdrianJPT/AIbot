import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Cursor-paginated EventLog viewer, ordered by (createdAt, id) desc — newest
 * first.
 *
 * Ownership scoping: `EventLog.businessId` is optional (global/startup
 * errors have no business yet). A row is visible to a user when its
 * `businessId` belongs to one of their businesses, OR when `businessId` is
 * null — global events aren't tenant-specific, so any authenticated user can
 * see them (documented in docs/plan/06-hardening-extras.md §6.2).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const level = searchParams.get("level") || undefined;
  const source = searchParams.get("source") || undefined;
  const cursor = searchParams.get("cursor") || undefined;
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  // EventLog.businessId has no Prisma relation (Phase 1 keeps it a plain
  // optional column), so ownership scoping is a two-step: resolve the
  // user's business ids, then filter businessId in that set OR null.
  const ownedBusinesses = await prisma.business.findMany({
    where: { ownerId: user.id },
    select: { id: true },
  });
  const businessIds = ownedBusinesses.map((b) => b.id);

  const events = await prisma.eventLog.findMany({
    where: {
      OR: [{ businessId: { in: businessIds } }, { businessId: null }],
      ...(level && { level }),
      ...(source && { source }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ events: page, nextCursor });
}
