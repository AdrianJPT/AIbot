import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site-url";

/**
 * Signs the current user out and redirects to /login. Wired to a "Salir"
 * button in the sidebar; called as a plain form POST so it works without
 * client-side JS.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", SITE_URL));
}
