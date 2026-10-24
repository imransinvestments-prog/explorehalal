/**
 * Fills in `restaurants.place_id` for venues whose stored Google photo URL has
 * expired but which have no Place ID, so /api/place-photo can serve them a
 * fresh photo. Only the Place ID is stored, as Google's terms allow.
 *
 * Each venue is looked up with one Places API (New) Text Search request for
 * its name + address, asking only for `places.id` (the cheapest, IDs-only
 * tier) and restricted to a small box around the coordinates we already hold,
 * so a same-named venue elsewhere can't match.
 *
 * COST SAFETY: every request is metered at a conservative TEXT_SEARCH_GBP and
 * the script stops issuing requests before the estimate would cross the hard
 * stop (default £9.75). All 1,929 candidates fit well inside that.
 *
 * Dry run by default: performs the lookups and reports what it would write,
 * without updating any rows. With --apply it only fills rows whose place_id is
 * still null, skips any Place ID another row already has (the column is
 * unique, and a clash usually means a duplicate listing), and writes the ids it
 * changed to a JSON file in the OS temp folder for rollback:
 *   UPDATE restaurants SET place_id = NULL WHERE id IN (...)
 *
 * Run:
 *   node --env-file=.env.local scripts/backfill-place-ids.mjs --limit=50     # dry run on a sample
 *   node --env-file=.env.local scripts/backfill-place-ids.mjs                # dry run, all
 *   node --env-file=.env.local scripts/backfill-place-ids.mjs --apply
 *   node --env-file=.env.local scripts/backfill-place-ids.mjs --apply --budget=5 --concurrency=2
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GCP_API_KEY_2 (preferred, unrestricted server key) / GOOGLE_PLACES_API_KEY
 */

import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const GOOGLE_PHOTO_PREFIX = "https://lh3.googleusercontent.com/"
// IDs-only Text Search is Google's cheapest tier; metered conservatively.
const TEXT_SEARCH_GBP = 0.004
// Half-size of the search box: ~330 m north-south and east-west at UK latitudes.
const LAT_DELTA = 0.003
const LNG_DELTA = 0.005
const MAX_ATTEMPTS = 3

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const APPLY = args.includes("--apply")
const LIMIT = flag("limit") ? Number(flag("limit")) : Infinity
const BUDGET_GBP = flag("budget") ? Number(flag("budget")) : 10
const HARD_STOP_GBP = Math.min(BUDGET_GBP - 0.25, 9.75)
const CONCURRENCY = Math.max(1, flag("concurrency") ? Number(flag("concurrency")) : 4)

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// Same precedence as lib/google-places.mjs; GCP_API_KEY is referrer-restricted.
const API_KEY = process.env.GCP_API_KEY_2 ?? process.env.GOOGLE_PLACES_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !API_KEY) {
  console.error("[place-ids] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GCP_API_KEY_2.")
  process.exit(1)
}

const gbp = (n) => `£${n.toFixed(2)}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loadAll(supabase, build) {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(supabase).order("id").range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/** One IDs-only Text Search, restricted to a box around the venue. Returns a Place ID or null. */
async function findPlaceId(venue) {
  const lat = Number(venue.latitude)
  const lng = Number(venue.longitude)
  const parts = [venue.name, venue.address, venue.postcode].map((p) => String(p ?? "").trim()).filter(Boolean)
  const body = {
    textQuery: [...new Set(parts)].join(", "),
    regionCode: "GB",
    languageCode: "en",
    maxResultCount: 1,
    locationRestriction: {
      rectangle: {
        low: { latitude: lat - LAT_DELTA, longitude: lng - LNG_DELTA },
        high: { latitude: lat + LAT_DELTA, longitude: lng + LNG_DELTA },
      },
    },
  }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": API_KEY, "X-Goog-FieldMask": "places.id" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }).catch((err) => ({ ok: false, status: 0, err }))
    if (res.ok) {
      const json = await res.json()
      const id = json?.places?.[0]?.id
      return { placeId: typeof id === "string" ? id : null }
    }
    const transient = res.status === 0 || res.status === 429 || res.status >= 500
    if (!transient || attempt >= MAX_ATTEMPTS) return { error: `HTTP ${res.status}` }
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const candidates = (
    await loadAll(supabase, (s) =>
      s
        .from("restaurants")
        .select("id, name, address, postcode, latitude, longitude")
        .is("place_id", null)
        .like("image_url", `${GOOGLE_PHOTO_PREFIX}%`),
    )
  ).slice(0, LIMIT)
  const taken = new Set(
    (await loadAll(supabase, (s) => s.from("restaurants").select("id, place_id").not("place_id", "is", null))).map(
      (r) => r.place_id,
    ),
  )

  console.log(`[place-ids] ${APPLY ? "APPLY" : "DRY RUN"}: ${candidates.length} venues, ${taken.size} Place IDs already stored`)
  console.log(`[place-ids] budget ${gbp(BUDGET_GBP)}, hard stop ${gbp(HARD_STOP_GBP)}, ~£${TEXT_SEARCH_GBP} per lookup`)

  let spend = 0
  let next = 0
  let done = 0
  let stoppedForBudget = false
  const matched = []
  const noMatch = []
  const clashes = []
  const failures = []

  const worker = async () => {
    while (next < candidates.length) {
      if (spend + TEXT_SEARCH_GBP > HARD_STOP_GBP) {
        stoppedForBudget = true
        return
      }
      const venue = candidates[next++]
      spend += TEXT_SEARCH_GBP
      const result = await findPlaceId(venue)
      if (result.error) failures.push({ id: venue.id, name: venue.name, reason: result.error })
      else if (!result.placeId) noMatch.push(venue)
      else if (taken.has(result.placeId)) clashes.push({ id: venue.id, name: venue.name, placeId: result.placeId })
      else {
        taken.add(result.placeId)
        matched.push({ id: venue.id, name: venue.name, placeId: result.placeId })
      }
      if (++done % 100 === 0) console.log(`[place-ids] ${done}/${candidates.length} looked up, ${gbp(spend)}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker))

  console.log(`[place-ids] looked up ${done}: ${matched.length} matched, ${noMatch.length} no match nearby, ` +
    `${clashes.length} already used by another row, ${failures.length} failed`)
  if (stoppedForBudget) console.log(`[place-ids] budget guard: stopped at ${gbp(spend)}; re-run to continue`)
  for (const m of matched.slice(0, 10)) console.log(`  + ${m.name} -> ${m.placeId}`)
  for (const c of clashes.slice(0, 10)) console.log(`  = ${c.name}: ${c.placeId} already stored on another row`)
  for (const f of failures.slice(0, 10)) console.log(`  ! ${f.name}: ${f.reason}`)
  console.log(`[place-ids] ESTIMATED SPEND: ${gbp(spend)}`)

  if (!APPLY) {
    console.log("[place-ids] Dry run only. Re-run with --apply to write the matched Place IDs.")
    return
  }

  const written = []
  for (const m of matched) {
    const { data, error } = await supabase
      .from("restaurants")
      .update({ place_id: m.placeId })
      .eq("id", m.id)
      .is("place_id", null)
      .select("id")
    if (error) failures.push({ id: m.id, name: m.name, reason: error.message })
    else if (data.length) written.push(m)
  }
  const logPath = join(tmpdir(), `backfill-place-ids-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  writeFileSync(logPath, JSON.stringify(written, null, 2))
  console.log(`[place-ids] wrote ${written.length} Place IDs; changed ids saved to ${logPath}`)
  if (failures.length) console.log(`[place-ids] ${failures.length} failures (rows left unchanged)`)
}

main().catch((err) => {
  console.error("[place-ids] Fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
