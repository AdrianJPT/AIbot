import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Invites a new client: creates the Supabase auth user (sends the magic
// link email) and precreates the Prisma User row so the client shows up in
// Admin > Clients right away, before they've ever logged in. getSessionUser
// upserts the same row on first login, so this doesn't conflict.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { email, name } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Falta el email" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: name ? { full_name: name } : undefined,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message || "No se pudo invitar al cliente" },
      { status: 400 }
    );
  }

  try {
    const client = await prisma.user.create({
      data: {
        id: data.user.id,
        email,
        name: name || null,
        role: "client",
      },
    });
    return NextResponse.json(client);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese email" },
        { status: 409 }
      );
    }
    throw err;
  }
}
