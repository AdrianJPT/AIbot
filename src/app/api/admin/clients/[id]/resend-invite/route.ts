import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type AuthErrorLike = { message?: string; status?: number; code?: string } | null;

// Once a client has already accepted their invite (signed in at least
// once), Supabase rejects a second inviteUserByEmail call — 422, message
// like "A user with this email address has already been registered", code
// "email_exists". That's the trigger to fall back to a magic-link OTP
// instead of surfacing the rejection as a dead end.
function isAlreadyRegisteredError(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.status === 422) return true;
  if (error.code === "email_exists") return true;
  return /already.*(registered|exists)/i.test(error.message || "");
}

// Resends access to a client: re-invites if they never accepted the
// original invite (fresh invite email), or falls back to a passwordless
// magic-link OTP if they already have (invites can't be resent past that
// point). requireAdmin + 404-on-anything-wrong pattern shared with the
// other admin/clients routes.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const client = await prisma.user.findUnique({ where: { id } });
  if (!client || client.role !== "client") {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const supabaseAdmin = createAdminClient();
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    client.email
  );

  if (!inviteError) {
    return NextResponse.json({ ok: true, method: "invite" });
  }

  if (!isAlreadyRegisteredError(inviteError)) {
    return NextResponse.json(
      { error: inviteError.message || "No se pudo reenviar la invitación" },
      { status: 400 }
    );
  }

  // Ephemeral anon client — not the cookie-bound server client, since this
  // isn't tied to any browser session (see src/lib/supabase/admin.ts for
  // the equivalent note on the service-role client).
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { error: otpError } = await anonClient.auth.signInWithOtp({
    email: client.email,
    options: { shouldCreateUser: false },
  });

  if (otpError) {
    return NextResponse.json(
      { error: otpError.message || "No se pudo enviar el enlace mágico" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, method: "magiclink" });
}
