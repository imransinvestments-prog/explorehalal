import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Admin Supabase client using the service-role key. This BYPASSES Row Level
 * Security, so it must only ever be imported from trusted server-side code
 * (server actions / route handlers) — never from a client component.
 *
 * The public `restaurants` table only has a SELECT policy, so writes (the
 * admin bulk upload) go through this privileged client.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
