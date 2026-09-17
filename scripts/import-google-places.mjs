/**
 * Discovers UK halal restaurants via the Google Places API (New) Text Search
 * endpoint and inserts the ones we don't already have into the Supabase
 * `restaurants` table.
 *
 * COST SAFETY (READ THIS FIRST):
 * This is the only importer that spends real money, so it is built around a
 * hard budget guard. Every billable call is metered in GBP and the script will
 * NOT issue a new billable request once the running estimate would cross
 * HARD_STOP_GBP (default £9.75, comfortably under the £10 ceiling).
 *   - Each Text Search *page* (up to 20 results) is billed once. Because we ask
 *     for rating + userRatingCount, this sits in Google's Enterprise + Atmosphere
 *     SKU: ~£0.028 per page.
 *   - Turning a photo reference into a stored image URL is a SEPARATE Place
 *     Photo call: ~£0.006 each.
 * Rating, review count, coordinates, address AND the photo reference all come
 * back inside the one Text Search page response — so discovering a venue and
 * getting its rating is a single billable call. Only the image URL costs extra.
 *
 * ALLOCATION (per product decision — "maximise new venues"):
 * The full budget is spent on discovery first. Photo URLs are resolved only
 * with whatever budget remains AFTER discovery has run out of areas to search.
 * If discovery uses the whole budget, new venues still get a rating (free with
 * the search) and simply fall back to the card's no-image header.
 *
 * COVERAGE STRATEGY:
 * Queries are tiled across a wide list of UK towns/cities (plus London areas).
 * Paging is BREADTH-FIRST: every area's page 1 is fetched before any area's
 * page 2. This spends the budget on maximally-distinct places rather than
 * exhausting three deep (often duplicate-heavy) pages in a handful of cities.
 *
 * DEDUPE:
 * A new place is skipped if its Google place_id is already stored, if we already
 * saw that place_id earlier in THIS run, or if a row with the same
 * normalised name + postcode already exists. Everything is stored as community
 * data (COMMUNITY / Other / Unverified) and existing HMC/HFA rows are never
 * touched.
 *
 * Run:
 *   node --env-file=.env.development.local scripts/import-google-places.mjs --dry-run
 *   node --env-file=.env.development.local scripts/import-google-places.mjs
 *   node --env-file=.env.development.local scripts/import-google-places.mjs --budget 5
 *   node --env-file=.env.development.local scripts/import-google-places.mjs --no-photos
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GCP_API_KEY_2 (preferred, unrestricted server key)
 */

import { createClient } from "@supabase/supabase-js"
import { groupCuisine, applyNameGroupOverride } from "../lib/cuisine-groups.mjs"
import { buildGoogleMapsUrl } from "../lib/google-maps.mjs"
import { resolvePhotoUri } from "../lib/google-places.mjs"

// ---------------------------------------------------------------------------
// Flags & config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const NO_PHOTOS = args.includes("--no-photos")
const DEBUG = args.includes("--debug")
const budgetFlagIdx = args.indexOf("--budget")
const BUDGET_GBP = budgetFlagIdx !== -1 ? Number(args[budgetFlagIdx + 1]) : 10

// Estimated GBP price per billable call. Text Search with rating/reviews is the
// Enterprise+Atmosphere SKU; Place Photo is billed separately.
const TEXT_SEARCH_GBP = 0.028
const PHOTO_GBP = 0.006
// Stop issuing new billable calls once the estimate would cross this. Kept a
// little under the ceiling so an in-flight call can never tip us over £10.
const HARD_STOP_GBP = Math.min(BUDGET_GBP - 0.25, 9.75)

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_KEY =
  process.env.GCP_API_KEY_2 ?? process.env.GCP_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY
const SOURCE = "Google Places"

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

if (!API_KEY) {
  console.error("[gp] Missing Google API key (GCP_API_KEY_2). Aborting.")
  process.exit(1)
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("[gp] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them or use --dry-run.")
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (t) => (t ?? "").replace(/\s+/g, " ").trim()
const gbp = (n) => `£${n.toFixed(2)}`

// ---------------------------------------------------------------------------
// UK areas to search. Broad national coverage plus dense London areas, where
// most UK halal venues cluster. Breadth-first paging means adding more areas
// improves coverage without risking the budget (the spend guard is the cap).
// ---------------------------------------------------------------------------
const LONDON_AREAS = [
  "Whitechapel London", "Ilford London", "Wembley London", "Tooting London",
  "Southall London", "Walthamstow London", "Green Street London", "Edgware Road London",
  "Stratford London", "East Ham London", "Croydon London", "Harrow London",
  "Hounslow London", "Barking London", "Lewisham London", "Peckham London",
  "Finsbury Park London", "Camden London", "Shoreditch London", "Wood Green London",
]
const UK_CITIES = [
  "Birmingham", "Manchester", "Leeds", "Bradford", "Leicester", "Luton", "Slough",
  "Blackburn", "Bolton", "Oldham", "Rochdale", "Preston", "Sheffield", "Nottingham",
  "Derby", "Coventry", "Wolverhampton", "Walsall", "Dudley", "Stoke-on-Trent",
  "Liverpool", "Newcastle upon Tyne", "Sunderland", "Middlesbrough", "Hull",
  "Huddersfield", "Halifax", "Dewsbury", "Batley", "Keighley", "Burnley", "Nelson",
  "Accrington", "Peterborough", "Cambridge", "Bedford", "Milton Keynes", "Reading",
  "Oxford", "Southampton", "Portsmouth", "Bristol", "Gloucester", "Swindon",
  "Cardiff", "Newport", "Swansea", "Glasgow", "Edinburgh", "Dundee", "Aberdeen",
  "Belfast", "Watford", "High Wycombe", "Aylesbury", "Crawley", "Woking", "Guildford",
  "Maidenhead", "Basingstoke", "Northampton", "Wellingborough", "Kettering",
  "Lincoln", "Doncaster", "Rotherham", "Barnsley", "Wakefield", "York", "Scunthorpe",
  "Grimsby", "Chester", "Warrington", "Wigan", "Stockport", "Salford", "Bury",
  "Tameside", "Trafford", "Telford", "Shrewsbury", "Worcester", "Redditch",
  "Nuneaton", "Rugby", "Tamworth", "Cannock", "Burton upon Trent", "Stafford",
  "Norwich", "Ipswich", "Colchester", "Chelmsford", "Southend-on-Sea", "Basildon",
  "Harlow", "Stevenage", "St Albans", "Hemel Hempstead", "Gillingham", "Chatham",
  "Maidstone", "Dartford", "Gravesend", "Ashford Kent", "Canterbury", "Brighton",
  "Eastbourne", "Hastings", "Worthing", "Plymouth", "Exeter", "Bournemouth", "Poole",
  "Bath", "Cheltenham", "Hereford", "Carlisle", "Lancaster", "Blackpool", "Southport",
  "Crewe", "Macclesfield", "Wrexham", "Falkirk", "Paisley", "Livingston", "Hamilton",
]
const AREAS = [...LONDON_AREAS, ...UK_CITIES]

// Google place types we accept as a halal food venue.
const FOOD_TYPES = new Set([
  "restaurant", "meal_takeaway", "meal_delivery", "cafe", "bakery",
  "food", "fast_food_restaurant", "sandwich_shop", "breakfast_restaurant",
  "indian_restaurant", "middle_eastern_restaurant", "turkish_restaurant",
  "pakistani_restaurant", "afghani_restaurant", "lebanese_restaurant",
  "mediterranean_restaurant", "barbecue_restaurant", "chicken_restaurant",
  "pizza_restaurant", "hamburger_restaurant", "asian_restaurant",
])

function isFoodPlace(place) {
  const types = place?.types ?? []
  if (types.some((t) => FOOD_TYPES.has(t))) return true
  return FOOD_TYPES.has(place?.primaryType)
}

/** Pull the UK postcode + a readable cuisine + country from a place. */
function extractParts(place) {
  const comps = place?.addressComponents ?? []
  const find = (type) => comps.find((c) => (c.types ?? []).includes(type))
  const postcode = norm(find("postal_code")?.longText ?? "").toUpperCase()
  const country = find("country")?.shortText ?? ""

  const primary = norm(place?.primaryTypeDisplayName?.text ?? "")
  const fallback = norm((place?.primaryType ?? "").replace(/_/g, " ").replace(/restaurant/i, "").trim())
  const cuisine = primary || fallback || "Restaurant/Takeaway"

  return { postcode, country, cuisine }
}

// ---------------------------------------------------------------------------
// One billable Text Search page. Returns { places, nextPageToken }.
// ---------------------------------------------------------------------------
async function textSearchPage(textQuery, pageToken) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const body = pageToken
      ? { pageToken }
      : { textQuery, regionCode: "GB", languageCode: "en", maxResultCount: 20 }
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.photos",
          "places.primaryType",
          "places.primaryTypeDisplayName",
          "places.types",
          "places.addressComponents",
          "nextPageToken",
        ].join(","),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      // Auth/quota problems should stop the whole run, not silently loop.
      if (res.status === 401 || res.status === 403) {
        console.error(`[gp] FATAL auth error ${res.status}: ${text}`)
        process.exit(1)
      }
      console.warn(`[gp] search HTTP ${res.status}: ${text.slice(0, 160)}`)
      return { places: [], nextPageToken: null }
    }
    const json = await res.json()
    return { places: json?.places ?? [], nextPageToken: json?.nextPageToken ?? null }
  } catch (err) {
    console.warn(`[gp] search failed: ${err.name === "AbortError" ? "timeout" : err.message}`)
    return { places: [], nextPageToken: null }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(
    `[gp] starting${DRY_RUN ? " (dry-run)" : ""}${NO_PHOTOS ? " (no-photos)" : ""} — ` +
      `budget ${gbp(BUDGET_GBP)}, hard stop ${gbp(HARD_STOP_GBP)}, ${AREAS.length} areas`,
  )

  let spend = 0
  const canSpend = (cost) => spend + cost <= HARD_STOP_GBP

  // Load existing rows for dedupe (name+postcode and any stored place_id).
  const existingPlaceId = new Set()
  const existingNamePostcode = new Set()
  let supabase = null
  if (!DRY_RUN) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("name, postcode, place_id")
        .range(from, from + PAGE - 1)
      if (error) {
        console.error("[gp] Failed to read existing rows:", error.message)
        return
      }
      if (!data || data.length === 0) break
      for (const r of data) {
        if (r.place_id) existingPlaceId.add(r.place_id)
        existingNamePostcode.add(`${(r.name ?? "").toLowerCase()}|${(r.postcode ?? "").toLowerCase()}`)
      }
      if (data.length < PAGE) break
    }
    console.log(`[gp] ${existingNamePostcode.size} existing row(s) loaded for dedupe`)
  }

  // Breadth-first page queue: all page-1 tasks up front. New-page tasks are
  // appended to the END, so every area's page 1 is processed before any page 2.
  const queue = AREAS.map((area) => ({ query: `halal restaurant in ${area}`, area, pageToken: null, page: 1 }))

  const today = new Date().toISOString().slice(0, 10)
  const seenPlaceId = new Set()
  const pendingPhotos = [] // { id, photoName } for inserted rows, resolved later
  let pagesFetched = 0
  let inserted = 0
  let rated = 0
  let skipped = 0
  let outsideUk = 0
  let notFood = 0

  // A dry-run still calls the paid Text Search API, so cap it to a few pages
  // (a few pennies) — just enough to validate query results, filtering, dedupe.
  const DRY_RUN_PAGE_CAP = 3

  while (queue.length > 0) {
    if (DRY_RUN && pagesFetched >= DRY_RUN_PAGE_CAP) {
      console.log(`[gp] dry-run page cap (${DRY_RUN_PAGE_CAP}) reached`)
      break
    }
    if (!canSpend(TEXT_SEARCH_GBP)) {
      console.log(`[gp] budget guard: stopping discovery at ${gbp(spend)} (${queue.length} area-pages left)`)
      break
    }
    const task = queue.shift()
    const { places, nextPageToken } = await textSearchPage(task.query, task.pageToken)
    spend += TEXT_SEARCH_GBP
    pagesFetched++

    for (const place of places) {
      const placeId = place?.id
      if (!placeId || seenPlaceId.has(placeId)) continue
      seenPlaceId.add(placeId)

      if (existingPlaceId.has(placeId)) { skipped++; continue }
      if (!isFoodPlace(place)) { notFood++; continue }

      const name = norm(place?.displayName?.text ?? "")
      if (!name) continue
      const { postcode, country, cuisine } = extractParts(place)
      if (country && country !== "GB") { outsideUk++; continue }
      if (!postcode) { skipped++; continue } // need a postcode to place/dedupe reliably

      const key = `${name.toLowerCase()}|${postcode.toLowerCase()}`
      if (existingNamePostcode.has(key)) { skipped++; continue }

      const address = norm(place?.formattedAddress ?? "")
      const rating = typeof place?.rating === "number" ? place.rating : null
      const reviewCount = typeof place?.userRatingCount === "number" ? place.userRatingCount : null
      const photoName = typeof place?.photos?.[0]?.name === "string" ? place.photos[0].name : null

      const row = {
        name,
        address: address || name,
        postcode,
        cuisine_type: cuisine,
        cuisine_group: applyNameGroupOverride(name, groupCuisine(cuisine)),
        certification_body: "COMMUNITY",
        certification_type: "Other",
        certification_status: "Unverified",
        last_scraped_date: today,
        source: SOURCE,
        place_id: placeId,
        latitude: place?.location?.latitude ?? null,
        longitude: place?.location?.longitude ?? null,
        google_maps_url: buildGoogleMapsUrl({ name, address, postcode }),
        ...(rating != null && { rating, review_count: reviewCount ?? 0 }),
      }

      if (DRY_RUN) {
        inserted++
        if (rating != null) rated++
        if (DEBUG && inserted <= 10) console.dir({ ...row, photoName }, { depth: null })
      } else {
        const { data, error } = await supabase.from("restaurants").insert(row).select("id").single()
        if (error) {
          if (error.code === "23505") skipped++
          else console.warn(`[gp] insert failed for ${name}: ${error.message}`)
        } else {
          inserted++
          if (rating != null) rated++
          existingPlaceId.add(placeId)
          existingNamePostcode.add(key)
          if (photoName && data?.id) pendingPhotos.push({ id: data.id, photoName })
        }
      }
    }

    // Queue the next page of this area (Google caps Text Search at 3 pages / 60).
    if (nextPageToken && task.page < 3) {
      queue.push({ query: task.query, area: task.area, pageToken: nextPageToken, page: task.page + 1 })
    }

    if (pagesFetched % 20 === 0) {
      console.log(
        `[gp] ${pagesFetched} pages, spend ${gbp(spend)} — ${inserted} inserted (${rated} rated), ` +
          `${skipped} skipped, ${notFood} non-food, ${outsideUk} non-UK`,
      )
    }
  }

  console.log(
    `[gp] discovery done — ${pagesFetched} pages, spend ${gbp(spend)}, ` +
      `${inserted} inserted (${rated} rated), ${skipped} skipped`,
  )

  // Photo pass: spend ONLY leftover budget resolving images for inserted rows.
  if (!DRY_RUN && !NO_PHOTOS && pendingPhotos.length > 0) {
    let imaged = 0
    console.log(`[gp] photo pass: ${pendingPhotos.length} candidate(s), ${gbp(HARD_STOP_GBP - spend)} left`)
    for (const { id, photoName } of pendingPhotos) {
      if (!canSpend(PHOTO_GBP)) {
        console.log(`[gp] budget guard: stopping photo pass at ${gbp(spend)}`)
        break
      }
      spend += PHOTO_GBP
      const url = await resolvePhotoUri(photoName)
      if (url) {
        const { error } = await supabase.from("restaurants").update({ image_url: url }).eq("id", id)
        if (!error) imaged++
      }
      await sleep(60)
    }
    console.log(`[gp] photo pass done — ${imaged} image(s) stored`)
  }

  console.log(`[gp] TOTAL ESTIMATED SPEND: ${gbp(spend)} (ceiling ${gbp(BUDGET_GBP)})`)
}

main().catch((err) => {
  console.error("[gp] Fatal:", err)
  process.exit(1)
})
