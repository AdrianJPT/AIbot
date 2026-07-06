import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site-url";

/**
 * Exchanges the OAuth/OTP `code` for a Supabase session and redirects to
 * the app. Public route — must stay reachable without a session.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/login", SITE_URL));
}
