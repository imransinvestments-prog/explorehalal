/**
 * One-off (re-runnable) backfill: derive `cuisine_group` for every restaurant
 * from its existing `cuisine_type` using the shared grouping logic.
 *
 * Run with the project's env file so the service-role key is available:
 *   node --env-file=.env.development.local scripts/backfill-cuisine-groups.mjs
 */
import { createClient } from "@supabase/supabase-js"
import { groupCuisine } from "../lib/cuisine-groups.mjs"

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[backfill] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const PAGE = 1000
let from = 0
let scanned = 0
let updated = 0
const groupTally = new Map()

for (;;) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, cuisine_type, cuisine_group")
    .range(from, from + PAGE - 1)

  if (error) {
    console.error(`[backfill] fetch failed: ${error.message}`)
    process.exit(1)
  }
  if (!data || data.length === 0) break

  for (const row of data) {
    scanned++
    const group = groupCuisine(row.cuisine_type)
    groupTally.set(group, (groupTally.get(group) ?? 0) + 1)
    if (row.cuisine_group !== group) {
      const { error: upErr } = await supabase
        .from("restaurants")
        .update({ cuisine_group: group })
        .eq("id", row.id)
      if (upErr) console.warn(`[backfill] update failed for ${row.id}: ${upErr.message}`)
      else updated++
    }
  }

  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\n[backfill] scanned ${scanned}, updated ${updated}`)
console.log("[backfill] group distribution:")
for (const [group, count] of [...groupTally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(4)}  ${group}`)
}
