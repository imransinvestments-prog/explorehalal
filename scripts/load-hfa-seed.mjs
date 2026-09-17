/**
 * Loads the curated HFA seed list (scripts/hfa-seed-data.mjs) into the
 * Supabase `restaurants` table.
 *
 * The Halal Food Authority publishes no scrapable directory (see the header
 * of hfa-seed-data.mjs), so HFA coverage comes from this hand-curated,
 * attributable list of publicly documented HFA-certified chain outlets.
 *
 * Behaviour mirrors the HMC scraper's DB stage:
 *   - geocode each postcode via postcodes.io (free, no auth, UK only)
 *   - dedupe on name+postcode: update existing rows, insert new ones
 *   - if an outlet already exists under HMC, flip it to certification_body
 *     "BOTH" instead of creating a duplicate
 *
 * Run:
 *   node scripts/load-hfa-seed.mjs                # geocode + upsert
 *   node scripts/load-hfa-seed.mjs --dry-run      # no DB writes
 *   node scripts/load-hfa-seed.mjs --no-geocode   # skip postcodes.io
 *   node scripts/load-hfa-seed.mjs --debug        # verbose
 *
 * Env (already present in this project):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { HFA_SEED } from "./hfa-seed-data.mjs"
import { resolveCuisine } from "../lib/cuisine-groups.mjs"
import { buildGoogleMapsUrl } from "../lib/google-maps.mjs"

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const DEBUG = args.includes("--debug")
const NO_GEOCODE = args.includes("--no-geocode")

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("[hfa] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them or run with --dry-run.")
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (t) => (t ?? "").replace(/\s+/g, " ").trim()

// ---------------------------------------------------------------------------
// Geocode via postcodes.io bulk endpoint (<=100 postcodes per call).
// ---------------------------------------------------------------------------
async function geocode(postcodes) {
  const coords = new Map()
  if (NO_GEOCODE || postcodes.length === 0) return coords
  for (let i = 0; i < postcodes.length; i += 100) {
    const batch = postcodes.slice(i, i + 100)
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: batch }),
      })
      const json = await res.json()
      for (const entry of json.result ?? []) {
        if (entry.result) {
          coords.set(entry.query.toUpperCase(), {
            lat: entry.result.latitude,
            lng: entry.result.longitude,
          })
        }
      }
    } catch (err) {
      console.warn(`[hfa] geocode batch failed: ${err.message}`)
    }
    await sleep(300)
  }
  console.log(`[hfa] geocoded ${coords.size}/${postcodes.length} postcode(s)`)
  return coords
}

// ---------------------------------------------------------------------------
// Upsert into Supabase. Dedupe on name+postcode; merge to BOTH when the same
// premises already exists under a different certification body.
// ---------------------------------------------------------------------------
async function saveToSupabase(records, coords) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: existing, error: readErr } = await supabase
    .from("restaurants")
    .select("id, name, postcode, certification_body")
  if (readErr) {
    console.error("[hfa] Failed to read existing rows:", readErr.message)
    return
  }

  const existingByKey = new Map(
    (existing ?? []).map((r) => [`${r.name.toLowerCase()}|${(r.postcode ?? "").toLowerCase()}`, r]),
  )
  // Also index by postcode so a KFC listed under a slightly different HMC name
  // at the same postcode can still be detected as the same premises.
  const existingByPostcode = new Map()
  for (const r of existing ?? []) {
    const pc = (r.postcode ?? "").toLowerCase()
    if (!existingByPostcode.has(pc)) existingByPostcode.set(pc, [])
    existingByPostcode.get(pc).push(r)
  }

  const today = new Date().toISOString().slice(0, 10)
  let inserted = 0
  let updated = 0
  let merged = 0

  for (const rec of records) {
    const nameKey = `${rec.name.toLowerCase()}|${rec.postcode.toLowerCase()}`
    const coord = coords.get(rec.postcode.toUpperCase())

    // Exact name+postcode match → same listing, refresh it.
    const exact = existingByKey.get(nameKey)

    // Same postcode + fuzzy name (shared chain word) → likely the same
    // premises already listed by HMC; merge to BOTH rather than duplicate.
    const sameName = (a, b) => {
      const aw = new Set(a.toLowerCase().split(/\s+/))
      return b.toLowerCase().split(/\s+/).some((w) => w.length > 3 && aw.has(w))
    }
    const fuzzy =
      !exact &&
      (existingByPostcode.get(rec.postcode.toLowerCase()) ?? []).find((r) => sameName(r.name, rec.name))

    const target = exact ?? fuzzy

    if (target) {
      const body = target.certification_body === "HFA" ? "HFA" : "BOTH"
      const payload = {
        certification_body: body,
        // BOTH is classed as HMC in the coarse type; HFA-only stays HFA.
        certification_type: body === "HFA" ? "HFA" : "HMC",
        last_scraped_date: today,
        ...(rec.source ? { source: rec.source } : {}),
        ...(coord ? { latitude: coord.lat, longitude: coord.lng } : {}),
      }
      const { error } = await supabase.from("restaurants").update(payload).eq("id", target.id)
      if (error) console.warn(`[hfa] update failed for "${rec.name}": ${error.message}`)
      else {
        updated++
        if (body === "BOTH" && target.certification_body !== "BOTH") merged++
      }
      continue
    }

    const { cuisineType, cuisineGroup } = resolveCuisine({ name: rec.name, cuisineType: rec.cuisine_type })
    const { error } = await supabase.from("restaurants").insert({
      name: rec.name,
      address: rec.address,
      postcode: rec.postcode,
      cuisine_type: cuisineType,
      cuisine_group: cuisineGroup,
      certification_body: "HFA",
      certification_type: "HFA",
      certification_status: "Certified",
      last_scraped_date: today,
      source: rec.source ?? null,
      latitude: coord?.lat ?? 0,
      longitude: coord?.lng ?? 0,
      google_maps_url: buildGoogleMapsUrl({ name: rec.name, address: rec.address, postcode: rec.postcode }),
    })
    if (error) console.warn(`[hfa] insert failed for "${rec.name}": ${error.message}`)
    else inserted++
  }

  console.log(`[hfa] Supabase: ${inserted} inserted, ${updated} updated (${merged} merged to BOTH)`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const records = HFA_SEED.map((r) => ({ ...r, name: norm(r.name), postcode: norm(r.postcode) }))
    .filter((r) => r.name && r.postcode)

  console.log(`[hfa] starting${DRY_RUN ? " (dry-run)" : ""} — ${records.length} seed outlet(s)`)

  const coords = await geocode([...new Set(records.map((r) => r.postcode))])
  const ungeocoded = records.filter((r) => !coords.get(r.postcode.toUpperCase()))
  if (ungeocoded.length && !NO_GEOCODE) {
    console.warn(
      `[hfa] ${ungeocoded.length} postcode(s) did not geocode: ` +
        ungeocoded.map((r) => r.postcode).join(", "),
    )
  }

  if (DRY_RUN) {
    console.log("[hfa] --dry-run: records (no DB writes):")
    console.dir(
      records.map((r) => ({ ...r, coords: coords.get(r.postcode.toUpperCase()) ?? null })),
      { depth: null },
    )
    return
  }

  await saveToSupabase(records, coords)
}

main().catch((err) => {
  console.error("[hfa] Fatal:", err)
  process.exit(1)
})
