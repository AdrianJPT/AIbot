import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const SELECT = { toolsEnabled: true } as const;

// Singleton platform-wide tool-calling kill switch (id is always "default").
// This is one half of the gate — see `toolsEffectivelyEnabled()` in
// src/lib/tools/enabled.ts: the loop only runs when this AND the per-tenant
// `Business.toolsEnabled` are both true. Off overrides every business's
// opt-in, so this is the honest place to look for "is tool-calling possible
// at all right now".
export async function GET() {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const config = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: SELECT,
  });
  return NextResponse.json(config);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  if (typeof body.toolsEnabled !== "boolean") {
    return NextResponse.json(
      { error: "toolsEnabled debe ser true o false" },
      { status: 400 },
    );
  }

  const config = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: { toolsEnabled: body.toolsEnabled },
    create: { id: "default", toolsEnabled: body.toolsEnabled },
    select: SELECT,
  });
  return NextResponse.json(config);
}
