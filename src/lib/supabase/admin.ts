import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS and can call the Admin API
 * (e.g. inviteUserByEmail). Never expose this client or its key to the
 * browser; only import this from server-only code (route handlers).
 */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
