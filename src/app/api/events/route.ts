import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Cursor-paginated EventLog viewer, ordered by (createdAt, id) desc — newest
 * first. Admin-only: the product owner needs visibility across every
 * client's businesses, so this route requires the "admin" role and returns
 * every event (no per-owner scoping) rather than 401/403 for non-admins —
 * 404 avoids revealing the route exists to a client.
 */
export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const level = searchParams.get("level") || undefined;
  const source = searchParams.get("source") || undefined;
  const cursor = searchParams.get("cursor") || undefined;
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const events = await prisma.eventLog.findMany({
    where: {
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
