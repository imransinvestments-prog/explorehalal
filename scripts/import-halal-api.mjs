/**
 * Imports halal venues from the HalalAPI (https://halal-api.vercel.app) into the
 * Supabase `restaurants` table.
 *
 * IMPORTANT — data-quality tiering:
 * The HalalAPI is Foursquare-sourced and its listings are mostly
 * `halal_certification: "unverified"` / `verified: false`. This is NOT the same
 * as an HMC/HFA certification. So every row imported here is stored as a
 * distinct, clearly-marked tier:
 *     certification_body   = "COMMUNITY"
 *     certification_status = "Unverified"
 * and the importer NEVER downgrades or overwrites an existing HMC/HFA/BOTH row.
 * If a venue already exists (by fsq_id, or by name+postcode), it is skipped so
 * trusted certified data is left untouched.
 *
 * The API returns `latitude`/`longitude` as null, so — like the HFA loader —
 * each venue's `postcode` is geocoded via postcodes.io (free, UK-only) and
 * venues whose postcode can't be resolved are skipped (they can't be mapped).
 *
 * The API is radius-based around a single point. It rejects many `zip` values
 * with HTTP 400 and caps results at ~50 per call, so we geocode a curated list
 * of UK halal-dense centre postcodes via postcodes.io and query the API by
 * `lat`/`lng` (reliable), deduping venues in-memory by their stable `fsq_id`.
 *
 * Run:
 *   node --env-file=.env.development.local scripts/import-halal-api.mjs
 *   node --env-file=.env.development.local scripts/import-halal-api.mjs --dry-run
 *   node --env-file=.env.development.local scripts/import-halal-api.mjs --radius=10
 *   node --env-file=.env.development.local scripts/import-halal-api.mjs --debug
 *
 * Env:
 *   HALAL_API_KEY                 (x-api-key for halal-api.vercel.app)
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { groupCuisine, applyNameGroupOverride } from "../lib/cuisine-groups.mjs"
import { buildGoogleMapsUrl } from "../lib/google-maps.mjs"
import { fetchPlaceRating, resolvePhotoUri } from "../lib/google-places.mjs"

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const DEBUG = args.includes("--debug")
const radiusArg = args.find((a) => a.startsWith("--radius="))
// Radius is in METRES. The upstream API caps each call at ~50 results and gets
// dramatically slower as the radius grows (radius=5000 times out; radius=2000
// returns the full page in ~20s), so 2000m is the reliable sweet spot. Coverage
// comes from many sweep centres rather than one large radius.
const RADIUS = radiusArg ? Number(radiusArg.split("=")[1]) : 2000

const API_BASE = "https://halal-api.vercel.app/api/v1/locations"
const API_KEY = process.env.HALAL_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SOURCE = "HalalAPI (halal-api.vercel.app)"

if (!API_KEY) {
  console.error("[halalapi] Missing HALAL_API_KEY.")
  process.exit(1)
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("[halalapi] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them or run with --dry-run.")
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (t) => (t ?? "").replace(/\s+/g, " ").trim()

/**
 * Curated sweep of UK halal-dense centres (representative postcodes). Each is
 * geocoded, then the API is queried by `lat`/`lng` + `radius`; overlapping
 * results are deduped by fsq_id. Add more here to widen coverage.
 */
const SWEEP_ZIPS = [
  // London
  "E1 6AN", "E7 9HZ", "E14 6AB", "N4 3JP", "N15 5BJ", "NW1 5PH", "SE1 2SX",
  "SW1P 4DF", "W1H 5QH", "SW17 0SP", "HA0 4LE", "UB1 1NB", "IG1 1BA", "CR0 1RE",
  // Midlands
  "B10 0UG", "B12 8QG", "CV1 5DL", "LE1 5WW", "LE5 3GH", "NG7 3GG", "WV1 1PB",
  // North West
  "M14 5LP", "M8 8RG", "OL1 1QB", "OL16 1PQ", "BB1 6BJ", "L1 8JQ", "PR1 1DA",
  // Yorkshire & North East
  "BD1 2LU", "LS1 5AD", "S2 4QT", "NE1 5XF", "HD1 2RH",
  // South & other
  "SL1 1ER", "LU1 2PL", "RG1 1DB", "BS5 6JL", "PE1 2AD", "CF24 3AA", "G3 7RH",
]

// ---------------------------------------------------------------------------
// Fetch one page of venues around a lat/lng point.
// ---------------------------------------------------------------------------
async function fetchPoint(label, lat, lng) {
  const url = `${API_BASE}?lat=${lat}&lng=${lng}&radius=${RADIUS}`
  // The upstream API throttles bursts, so retry a few times with backoff before
  // giving up on a point.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController()
    // The API is genuinely slow (~20-25s per full page), so allow generous headroom.
    const timer = setTimeout(() => controller.abort(), 40000)
    try {
      const res = await fetch(url, { headers: { "x-api-key": API_KEY }, signal: controller.signal })
      if (res.status === 429) {
        console.warn(`[halalapi] ${label}: rate-limited (429), backing off`)
        await sleep(attempt * 4000)
        continue
      }
      if (!res.ok) {
        console.warn(`[halalapi] ${label}: HTTP ${res.status}`)
        return []
      }
      const json = await res.json()
      const rows = json.data ?? json.results ?? []
      if (DEBUG) console.log(`[halalapi] ${label}: ${rows.length} venue(s)`)
      return rows
    } catch (err) {
      const reason = err.name === "AbortError" ? "timeout" : err.message
      if (attempt < 3) {
        console.warn(`[halalapi] ${label}: ${reason} (attempt ${attempt}/3), retrying`)
        await sleep(attempt * 4000)
      } else {
        console.warn(`[halalapi] ${label}: ${reason} — giving up after 3 attempts`)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// Geocode postcodes via postcodes.io bulk endpoint (<=100 per call).
// ---------------------------------------------------------------------------
async function geocode(postcodes) {
  const coords = new Map()
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
      console.warn(`[halalapi] geocode batch failed: ${err.message}`)
    }
    await sleep(300)
  }
  console.log(`[halalapi] geocoded ${coords.size}/${postcodes.length} postcode(s)`)
  return coords
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(
    `[halalapi] starting${DRY_RUN ? " (dry-run)" : ""} — sweeping ${SWEEP_ZIPS.length} area(s), radius=${RADIUS}`,
  )

  // 1. Geocode the sweep centres (the API rejects many raw postcodes, but
  //    accepts lat/lng reliably).
  const centres = await geocode(SWEEP_ZIPS)
  console.log(`[halalapi] ${centres.size}/${SWEEP_ZIPS.length} sweep centre(s) geocoded`)

  // 2. Set up Supabase + load existing rows once (for dedupe), unless dry-run.
  //    We write INCREMENTALLY after each sweep point so a long, interruptible
  //    run never loses all its progress — partial coverage still persists.
  let supabase = null
  const existingFsq = new Set()
  const existingNamePostcode = new Set()
  if (!DRY_RUN) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    const { data: existing, error: readErr } = await supabase
      .from("restaurants")
      .select("id, name, postcode, fsq_id")
    if (readErr) {
      console.error("[halalapi] Failed to read existing rows:", readErr.message)
      return
    }
    for (const r of existing ?? []) {
      if (r.fsq_id) existingFsq.add(r.fsq_id)
      existingNamePostcode.add(`${(r.name ?? "").toLowerCase()}|${(r.postcode ?? "").toLowerCase()}`)
    }
    console.log(`[halalapi] ${existingNamePostcode.size} existing row(s) loaded for dedupe`)
  }

  const seenThisRun = new Set()
  const drySamples = []
  let totalInserted = 0
  let totalSkippedExisting = 0
  let totalSkippedUngeocoded = 0
  let pointsDone = 0

  // 3. Query the API around each centre, then geocode + write that point's
  //    venues immediately before moving on.
  for (const [label, coord] of centres) {
    const rows = await fetchPoint(label, coord.lat, coord.lng)

    const venues = []
    for (const v of rows) {
      const id = v.fsq_id ?? `${norm(v.name)}|${norm(v.postcode)}`
      if (seenThisRun.has(id)) continue
      seenThisRun.add(id)
      const venue = {
        fsq_id: v.fsq_id ?? null,
        name: norm(v.name),
        address: norm(v.address) || norm(v.name),
        postcode: norm(v.postcode).toUpperCase(),
        cuisine_type: norm(v.cuisine_type) || "Restaurant/Takeaway",
      }
      if (venue.name && venue.postcode) venues.push(venue)
    }

    if (venues.length === 0) {
      pointsDone++
      await sleep(250)
      continue
    }

    const coords = await geocode([...new Set(venues.map((v) => v.postcode))])

    if (DRY_RUN) {
      for (const v of venues) {
        if (coords.get(v.postcode) && drySamples.length < 8) {
          drySamples.push({ ...v, cuisine_group: applyNameGroupOverride(v.name, groupCuisine(v.cuisine_type)), coords: coords.get(v.postcode) })
        }
      }
      pointsDone++
      await sleep(250)
      continue
    }

    const res = await insertVenues(supabase, venues, coords, existingFsq, existingNamePostcode)
    totalInserted += res.inserted
    totalSkippedExisting += res.skippedExisting
    totalSkippedUngeocoded += res.skippedUngeocoded
    pointsDone++
    console.log(
      `[halalapi] ${label} (${pointsDone}/${centres.size}): +${res.inserted} inserted ` +
        `[running total ${totalInserted}]`,
    )
    await sleep(250)
  }

  if (DRY_RUN) {
    console.log(`[halalapi] --dry-run complete. ${seenThisRun.size} unique venue(s) seen. Sample:`)
    console.dir(drySamples, { depth: null })
    return
  }

  console.log(
    `[halalapi] DONE — ${totalInserted} inserted (COMMUNITY/Unverified), ` +
      `${totalSkippedExisting} skipped (already present), ${totalSkippedUngeocoded} skipped (no geocode)`,
  )
}

// ---------------------------------------------------------------------------
// Insert a single sweep point's venues as COMMUNITY/Unverified. Skip anything
// that already exists (by fsq_id, or by name+postcode) so trusted HMC/HFA rows
// are never touched. The dedupe sets are mutated so later points in the same
// run don't re-insert the same venue.
// ---------------------------------------------------------------------------
async function insertVenues(supabase, venues, coords, existingFsq, existingNamePostcode) {
  const today = new Date().toISOString().slice(0, 10)
  let inserted = 0
  let skippedExisting = 0
  let skippedUngeocoded = 0
  const toInsert = []

  for (const v of venues) {
    const coord = coords.get(v.postcode)
    if (!coord) {
      skippedUngeocoded++
      continue
    }
    if (v.fsq_id && existingFsq.has(v.fsq_id)) {
      skippedExisting++
      continue
    }
    if (existingNamePostcode.has(`${v.name.toLowerCase()}|${v.postcode.toLowerCase()}`)) {
      skippedExisting++
      continue
    }

    const ratingInfo = await fetchPlaceRating({ name: v.name, address: v.address, postcode: v.postcode })
    const imageUrl = ratingInfo?.photoName ? await resolvePhotoUri(ratingInfo.photoName) : null
    toInsert.push({
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
      fsq_id: v.fsq_id,
      latitude: coord.lat,
      longitude: coord.lng,
      google_maps_url: buildGoogleMapsUrl({ name: v.name, address: v.address, postcode: v.postcode }),
      ...(ratingInfo && { rating: ratingInfo.rating, review_count: ratingInfo.reviewCount }),
      ...(imageUrl && { image_url: imageUrl }),
    })
    // Guard against duplicate inserts within this same run.
    existingNamePostcode.add(`${v.name.toLowerCase()}|${v.postcode.toLowerCase()}`)
    if (v.fsq_id) existingFsq.add(v.fsq_id)
  }

  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200)
    const { error } = await supabase.from("restaurants").insert(chunk)
    if (error) console.warn(`[halalapi] insert chunk failed: ${error.message}`)
    else inserted += chunk.length
  }

  return { inserted, skippedExisting, skippedUngeocoded }
}

main().catch((err) => {
  console.error("[halalapi] Fatal:", err)
  process.exit(1)
})
