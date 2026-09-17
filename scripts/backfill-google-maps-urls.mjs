/**
 * Backfills `google_maps_url` for every existing `restaurants` row that doesn't
 * yet have one, using the same shared builder every import path uses.
 *
 * Run:
 *   node --env-file=.env.development.local scripts/backfill-google-maps-urls.mjs
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { buildGoogleMapsUrl } from "../lib/google-maps.mjs"

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[backfill] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  // Page through all rows lacking a maps URL.
  const pageSize = 1000
  let from = 0
  let total = 0
  let updated = 0

  for (;;) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, address, postcode, google_maps_url")
      .is("google_maps_url", null)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error("[backfill] read failed:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    total += data.length
    for (const row of data) {
      const url = buildGoogleMapsUrl({
        name: row.name,
        address: row.address,
        postcode: row.postcode,
      })
      if (!url) continue
      const { error: upErr } = await supabase
        .from("restaurants")
        .update({ google_maps_url: url })
        .eq("id", row.id)
      if (upErr) console.warn(`[backfill] update failed for ${row.id}: ${upErr.message}`)
      else updated++
    }

    if (data.length < pageSize) break
    from += pageSize
  }

  console.log(`[backfill] DONE — ${updated}/${total} row(s) updated with a Google Maps URL`)
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err)
  process.exit(1)
})
