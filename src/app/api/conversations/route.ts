import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope, isAdmin } from "@/lib/scope";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Cursor-paginated conversation list, ordered by (lastMessageAt, id) desc —
 * newest first, matching the `[id]/messages/route.ts` cursor pattern. Admin
 * sessions get the same treatment (no `businessId` qualifier) so pagination
 * stays correct at platform-wide volume, served by the bare `lastMessageAt`
 * index (see prisma/schema.prisma).
 *
 * Response is an envelope `{ items, nextCursor, multiBusiness, scope }`
 * rather than a bare array — `multiBusiness` and `scope` let the client
 * render a cross-tenant badge and derive realtime subscription scope
 * without recomputing them from a client-side superset (which broke under
 * pagination).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const businessId = searchParams.get("businessId");
  const phoneNumberId = searchParams.get("phoneNumberId");
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const cursor = searchParams.get("cursor") || undefined;
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const where = {
    ...conversationScope(user),
    ...(businessId && { businessId }),
    ...(phoneNumberId && { phoneNumberId }),
    ...(status && { status }),
    // `mode: "insensitive"` compiles to ILIKE on Postgres.
    ...(q && {
      OR: [
        { customerName: { contains: q, mode: "insensitive" as const } },
        { customerPhone: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  const list = await prisma.conversation.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: {
      business: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const hasMore = list.length > limit;
  const page = hasMore ? list.slice(0, limit) : list;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const items = page.map(({ messages, ...conversation }) => ({
    ...conversation,
    lastMessage: messages[0] ?? null,
  }));

  // Only computed on the first page (no cursor) — a capped 2-row `groupBy`
  // is correct under pagination and bounded, unlike a full DISTINCT count
  // over all tenants. The UI only cares whether it's >1.
  let multiBusiness = false;
  if (!cursor) {
    const businessGroups = await prisma.conversation.groupBy({
      by: ["businessId"],
      where,
      orderBy: { businessId: "asc" },
      take: 2,
    });
    multiBusiness = businessGroups.length > 1;
  }

  const admin = isAdmin(user);
  const businessIds = admin
    ? []
    : (
        await prisma.business.findMany({
          where: { ownerId: user.id },
          select: { id: true },
        })
      ).map((b) => b.id);

  return NextResponse.json({
    items,
    nextCursor,
    multiBusiness,
    scope: { admin, businessIds },
  });
}
