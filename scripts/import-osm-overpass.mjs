/**
 * Imports halal venues from OpenStreetMap via the free Overpass API into the
 * Supabase `restaurants` table.
 *
 * WHY OSM:
 * Many UK food venues are tagged `diet:halal=yes` (some also `diet:halal=only`).
 * This is community-contributed data — accurate for "serves halal" but it is NOT
 * an HMC/HFA certification. So, exactly like the HalalAPI importer, every row is
 * stored in a clearly-marked community tier:
 *     certification_body   = "COMMUNITY"
 *     certification_type   = "Other"
 *     certification_status = "Community-tagged"
 * and the importer NEVER overwrites an existing HMC/HFA/BOTH row. Existing rows
 * (matched by osm_id, then by name+postcode) are skipped so trusted certified
 * data is left untouched.
 *
 * COORDINATES:
 * Unlike HalalAPI, OSM gives us lat/lng directly (nodes carry lat/lon; ways and
 * relations get a computed centre via `out center`). No geocoding is needed to
 * place a pin. We only call postcodes.io to *reverse* geocode a postcode when a
 * venue has no `addr:postcode` tag (bulk, by coordinate).
 *
 * ENRICHMENT:
 * Each newly-inserted venue is enriched with a Google rating + review count and
 * a displayable photo URL, using the same shared helper as the other importers.
 *
 * Run:
 *   node --env-file=.env.development.local scripts/import-osm-overpass.mjs
 *   node --env-file=.env.development.local scripts/import-osm-overpass.mjs --dry-run
 *   node --env-file=.env.development.local scripts/import-osm-overpass.mjs --debug
 *   node --env-file=.env.development.local scripts/import-osm-overpass.mjs --no-enrich
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GCP_API_KEY_2 (preferred, unrestricted server key) — for rating/image enrichment
 */

import { createClient } from "@supabase/supabase-js"
import { groupCuisine, applyNameGroupOverride } from "../lib/cuisine-groups.mjs"
import { buildGoogleMapsUrl } from "../lib/google-maps.mjs"
import { fetchPlaceRating, resolvePhotoUri } from "../lib/google-places.mjs"

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const DEBUG = args.includes("--debug")
const NO_ENRICH = args.includes("--no-enrich")

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SOURCE = "OpenStreetMap (Overpass)"

// Public Overpass mirrors. We try them in order so a single overloaded mirror
// doesn't fail the whole run.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

// Query every UK node/way/relation tagged as serving halal. `diet:halal=yes`
// (serves halal) and `diet:halal=only` (fully halal) are both included;
// `diet:halal=no` is intentionally excluded. `out center tags` returns a
// representative coordinate for ways/relations too.
const OVERPASS_QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="GB"][admin_level=2]->.uk;
(
  nwr["diet:halal"="yes"](area.uk);
  nwr["diet:halal"="only"](area.uk);
);
out center tags;
`

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("[osm] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them or run with --dry-run.")
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (t) => (t ?? "").replace(/\s+/g, " ").trim()
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i

// ---------------------------------------------------------------------------
// Fetch the raw OSM elements from Overpass, trying each mirror in turn.
// ---------------------------------------------------------------------------
async function fetchOverpass() {
  // Overpass returns 406/429 to clients that omit a descriptive User-Agent or
  // Accept header, so we always send them. Each mirror gets a couple of
  // attempts with backoff before we fall through to the next one.
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent": "ExploreHalal/1.0 (UK halal restaurant finder; contact via explorehalal.co.uk)",
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[osm] querying ${endpoint} (attempt ${attempt}/2) ...`)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 300000)
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: "data=" + encodeURIComponent(OVERPASS_QUERY),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer))

        if (res.status === 429 || res.status === 504 || res.status === 406) {
          console.warn(`[osm] ${endpoint}: HTTP ${res.status} (busy/rejected), backing off`)
          await sleep(attempt * 5000)
          continue
        }
        if (!res.ok) {
          console.warn(`[osm] ${endpoint}: HTTP ${res.status}, trying next mirror`)
          break
        }
        const json = await res.json()
        const elements = json?.elements ?? []
        console.log(`[osm] ${elements.length} element(s) returned`)
        if (elements.length > 0) return elements
        console.warn(`[osm] ${endpoint}: empty result, trying next mirror`)
        break
      } catch (err) {
        const reason = err.name === "AbortError" ? "timeout" : err.message
        console.warn(`[osm] ${endpoint}: ${reason} (attempt ${attempt}/2)`)
        await sleep(attempt * 3000)
      }
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// Turn a raw OSM element into a normalised venue (or null if unusable).
// ---------------------------------------------------------------------------
function toVenue(el) {
  const tags = el.tags ?? {}
  const name = norm(tags.name || tags["name:en"] || tags.brand)
  if (!name) return null // unnamed venues can't be listed meaningfully

  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (typeof lat !== "number" || typeof lng !== "number") return null

  // Compose a street address from the OSM addr:* tags where present.
  const addressParts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"] || tags["addr:town"] || tags["addr:suburb"],
  ]
    .map(norm)
    .filter(Boolean)
  const address = addressParts.join(", ")

  let postcode = norm(tags["addr:postcode"]).toUpperCase()
  if (postcode && !UK_POSTCODE_RE.test(postcode)) postcode = "" // ignore malformed

  // OSM cuisine is a ";"-separated list, e.g. "kebab;pizza". Use the first.
  const cuisineType = norm((tags.cuisine || "").split(";")[0]).replace(/_/g, " ") || "Restaurant/Takeaway"

  return {
    osm_id: `${el.type}/${el.id}`,
    name,
    address: address || name,
    postcode, // may be "" — filled by reverse geocode later
    cuisine_type: cuisineType,
    latitude: lat,
    longitude: lng,
  }
}

// ---------------------------------------------------------------------------
// Reverse-geocode coordinates to a nearest UK postcode via postcodes.io
// (bulk, <=100 per call). Only used for venues lacking an addr:postcode tag.
// ---------------------------------------------------------------------------
async function reverseGeocode(venues) {
  const need = venues.filter((v) => !v.postcode)
  if (need.length === 0) return
  console.log(`[osm] reverse-geocoding ${need.length} venue(s) without a postcode tag`)

  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100)
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geolocations: batch.map((v) => ({
            longitude: v.longitude,
            latitude: v.latitude,
            limit: 1,
            radius: 2000,
          })),
        }),
      })
      const json = await res.json()
      const results = json?.result ?? []
      // postcodes.io returns results in the same order as the query.
      results.forEach((entry, idx) => {
        const pc = entry?.result?.[0]?.postcode
        if (pc) batch[idx].postcode = pc.toUpperCase()
      })
    } catch (err) {
      console.warn(`[osm] reverse-geocode batch failed: ${err.message}`)
    }
    await sleep(300)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[osm] starting${DRY_RUN ? " (dry-run)" : ""}${NO_ENRICH ? " (no-enrich)" : ""}`)

  // 1. Pull raw elements from Overpass and normalise them.
  const elements = await fetchOverpass()
  if (elements.length === 0) {
    console.error("[osm] No elements returned from any Overpass mirror. Aborting.")
    return
  }

  const byOsmId = new Map()
  for (const el of elements) {
    const v = toVenue(el)
    if (v && !byOsmId.has(v.osm_id)) byOsmId.set(v.osm_id, v)
  }
  const venues = [...byOsmId.values()]
  console.log(`[osm] ${venues.length} named, locatable venue(s) after normalise`)

  // 2. Fill in postcodes for venues that don't carry an addr:postcode tag.
  await reverseGeocode(venues)
  const withPostcode = venues.filter((v) => v.postcode)
  console.log(`[osm] ${withPostcode.length}/${venues.length} venue(s) have a usable postcode`)

  if (DRY_RUN) {
    console.log(`[osm] --dry-run complete. Sample:`)
    console.dir(
      withPostcode.slice(0, 8).map((v) => ({ ...v, cuisine_group: applyNameGroupOverride(v.name, groupCuisine(v.cuisine_type)) })),
      { depth: null },
    )
    return
  }

  // 3. Set up Supabase and load existing rows for dedupe.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const existingOsm = new Set()
  const existingNamePostcode = new Set()
  {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("name, postcode, osm_id")
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) {
        console.error("[osm] Failed to read existing rows:", error.message)
        return
      }
      if (!data || data.length === 0) break
      for (const r of data) {
        if (r.osm_id) existingOsm.add(r.osm_id)
        existingNamePostcode.add(`${(r.name ?? "").toLowerCase()}|${(r.postcode ?? "").toLowerCase()}`)
      }
      if (data.length < PAGE) break
    }
  }
  console.log(`[osm] ${existingNamePostcode.size} existing row(s) loaded for dedupe`)

  // 4. Insert new venues incrementally (enrich each with Google data first).
  const today = new Date().toISOString().slice(0, 10)
  let inserted = 0
  let skippedExisting = 0
  let rated = 0
  let imaged = 0
  let done = 0

  for (const v of withPostcode) {
    done++
    if (existingOsm.has(v.osm_id)) {
      skippedExisting++
      continue
    }
    if (existingNamePostcode.has(`${v.name.toLowerCase()}|${v.postcode.toLowerCase()}`)) {
      skippedExisting++
      continue
    }

    let ratingInfo = null
    let imageUrl = null
    if (!NO_ENRICH) {
      ratingInfo = await fetchPlaceRating({ name: v.name, address: v.address, postcode: v.postcode })
      imageUrl = ratingInfo?.photoName ? await resolvePhotoUri(ratingInfo.photoName) : null
    }

    const row = {
      name: v.name,
      address: v.address,
      postcode: v.postcode,
      cuisine_type: v.cuisine_type,
      cuisine_group: applyNameGroupOverride(v.name, groupCuisine(v.cuisine_type)),
      certification_body: "COMMUNITY",
      certification_type: "Other",
      certification_status: "Unverified",
      last_scraped_date: today,
      source: SOURCE,
      osm_id: v.osm_id,
      latitude: v.latitude,
      longitude: v.longitude,
      google_maps_url: buildGoogleMapsUrl({ name: v.name, address: v.address, postcode: v.postcode }),
      ...(ratingInfo && { rating: ratingInfo.rating, review_count: ratingInfo.reviewCount }),
      ...(imageUrl && { image_url: imageUrl }),
    }

    const { error } = await supabase.from("restaurants").insert(row)
    if (error) {
      // A unique-violation on osm_id just means a concurrent/previous run added
      // it — treat as skip, not failure.
      if (error.code === "23505") skippedExisting++
      else console.warn(`[osm] insert failed for ${v.name}: ${error.message}`)
    } else {
      inserted++
      if (row.rating != null) rated++
      if (row.image_url) imaged++
      existingOsm.add(v.osm_id)
      existingNamePostcode.add(`${v.name.toLowerCase()}|${v.postcode.toLowerCase()}`)
    }

    if (done % 50 === 0) {
      console.log(
        `[osm] ${done}/${withPostcode.length} processed — ${inserted} inserted ` +
          `(${rated} rated, ${imaged} imaged), ${skippedExisting} skipped`,
      )
    }
    if (!NO_ENRICH) await sleep(120) // gentle pacing for the Places API
  }

  console.log(
    `[osm] DONE — ${inserted} inserted (COMMUNITY/Community-tagged), ` +
      `${rated} rated, ${imaged} imaged, ${skippedExisting} skipped (already present)`,
  )
}

main().catch((err) => {
  console.error("[osm] Fatal:", err)
  process.exit(1)
})
