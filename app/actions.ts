"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { geocodeLocation, type Coordinates } from "@/lib/distance"
import { resolveCuisine } from "@/lib/cuisine-groups.mjs"
import { buildGoogleMapsUrl } from "@/lib/google-maps.mjs"
import { fetchPlaceRating } from "@/lib/google-places.mjs"
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  isAdmin,
  sessionToken,
  verifyPassword,
} from "@/lib/admin-auth"
import { fetchRestaurants } from "@/lib/restaurants-server"
import { findDuplicateClusters } from "@/lib/dedupe"
import type { Restaurant } from "@/lib/types"
import { revalidatePath } from "next/cache"

// ---------------------------------------------------------------------------
// Admin authentication (single shared password gate)
// ---------------------------------------------------------------------------

export interface AdminLoginState {
  error?: string
}

export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const password = String(formData.get("password") ?? "")

  if (!verifyPassword(password)) {
    return { error: "Incorrect password. Please try again." }
  }

  const store = await cookies()
  store.set(ADMIN_COOKIE, sessionToken(), ADMIN_COOKIE_OPTIONS)
  redirect("/admin")
}

export async function adminLogout(): Promise<void> {
  const store = await cookies()
  store.delete(ADMIN_COOKIE)
  redirect("/")
}

export interface SearchLogInput {
  postcode: string
  distanceMiles: number
  cuisineType: string
  latitude: number | null
  longitude: number | null
  resultsCount: number
}

export async function logSearch(input: SearchLogInput): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from("search_logs").insert({
      postcode: input.postcode.trim() || null,
      distance_miles: input.distanceMiles,
      cuisine_type: input.cuisineType === "all" ? null : input.cuisineType,
      latitude: input.latitude,
      longitude: input.longitude,
      results_count: input.resultsCount,
    })
  } catch (error) {
    // Logging is best-effort analytics — never let it break the search UX.
    console.error("[v0] Failed to log search:", error)
  }
}

// ---------------------------------------------------------------------------
// Bulk restaurant upload (admin)
// ---------------------------------------------------------------------------

export interface UploadRow {
  name?: string
  address?: string
  postcode?: string
  cuisine_type?: string
  certification_body?: string
  certification_status?: string
  source?: string
  // GeoJSON geometries carry coordinates directly. When present we trust them
  // and skip geocoding; a missing postcode is then reverse-geocoded from them.
  latitude?: number | string
  longitude?: number | string
}

export interface UploadRowResult {
  row: number
  name: string
  postcode: string
  status: "inserted" | "updated" | "skipped"
  reason?: string
}

export interface UploadSummary {
  inserted: number
  updated: number
  skipped: number
  results: UploadRowResult[]
}

const VALID_BODIES = new Set(["HMC", "HFA", "BOTH", "COMMUNITY"])
const VALID_STATUSES = new Set(["Certified", "Pending", "Expired", "Suspended", "Unverified"])

function normalizeBody(raw?: string): string | null {
  if (!raw) return "COMMUNITY"
  const v = raw.trim().toUpperCase()
  if (v === "HMC & HFA" || v === "HMC/HFA" || v === "HMC AND HFA") return "BOTH"
  return VALID_BODIES.has(v) ? v : null
}

function normalizeStatus(raw?: string): string {
  if (!raw) return "Unverified"
  const v = raw.trim().toLowerCase()
  const match = [...VALID_STATUSES].find((s) => s.toLowerCase() === v)
  return match ?? "Unverified"
}

// Matches a UK postcode anywhere in a string (with or without the internal
// space). Used to recover a postcode from the address when its own column is
// blank, so those rows are no longer skipped with a "Missing postcode" error.
const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

function extractPostcodeFromAddress(address?: string): string {
  if (!address) return ""
  const match = address.toString().toUpperCase().match(UK_POSTCODE_RE)
  if (!match) return ""
  // Re-join with a single canonical space, e.g. "M14 5LP".
  return `${match[1]} ${match[2]}`
}

/**
 * Remove duplicate rows within a single upload, BEFORE any database work — so a
 * file that lists the same venue twice only results in one write. Two rows are
 * the same venue when they share a name and either the same postcode or (for
 * GeoJSON points with no postcode) effectively the same coordinates (~11m).
 * The first occurrence wins.
 */
function dedupeUploadRows(rows: UploadRow[]): UploadRow[] {
  const seen = new Set<string>()
  const out: UploadRow[] = []
  for (const r of rows) {
    const name = (r.name ?? "").toString().trim().toLowerCase()
    const postcode = (r.postcode ?? "").toString().trim().toLowerCase()
    const lat = r.latitude != null && `${r.latitude}` !== "" ? Number(r.latitude) : null
    const lng = r.longitude != null && `${r.longitude}` !== "" ? Number(r.longitude) : null
    const geo =
      lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)},${lng.toFixed(4)}`
        : ""
    // Rows with no locator at all can't be deduped meaningfully; pass them
    // through so they're skipped later with a proper reason.
    if (!name && !postcode && !geo) {
      out.push(r)
      continue
    }
    const key = `${name}|${postcode || geo}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** Reverse-geocode a lat/lng into the nearest UK postcode via postcodes.io. */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1&radius=2000`,
    )
    if (res.ok) {
      const json = await res.json()
      const pc = json?.result?.[0]?.postcode
      if (pc) return String(pc).trim().toUpperCase()
    }
  } catch {
    // Best-effort — the caller skips the row if no postcode can be resolved.
  }
  return ""
}

/**
 * Validate, geocode and upsert a batch of restaurant rows parsed from an
 * uploaded spreadsheet. Runs with the service-role client (RLS-bypassing),
 * so it must stay server-only. Dedupes on name + postcode: existing rows are
 * updated, new ones inserted. Invalid rows are skipped with a reason.
 */
export async function uploadRestaurants(rows: UploadRow[]): Promise<UploadSummary> {
  const supabase = createAdminClient()
  const results: UploadRowResult[] = []
  let inserted = 0
  let updated = 0
  let skipped = 0

  // De-dupe the uploaded rows against each other before touching the database.
  const deduped = dedupeUploadRows(rows)

  for (let i = 0; i < deduped.length; i++) {
    const raw = deduped[i]
    const rowNum = i + 1
    const name = (raw.name ?? "").toString().trim()

    // Coordinates may come straight from a GeoJSON geometry. When present we
    // trust them and skip geocoding entirely.
    const providedLat =
      raw.latitude !== undefined && raw.latitude !== null && `${raw.latitude}` !== ""
        ? Number(raw.latitude)
        : null
    const providedLng =
      raw.longitude !== undefined && raw.longitude !== null && `${raw.longitude}` !== ""
        ? Number(raw.longitude)
        : null
    const hasCoords =
      providedLat !== null &&
      providedLng !== null &&
      Number.isFinite(providedLat) &&
      Number.isFinite(providedLng)

    // Prefer the postcode column, fall back to scanning the address, and as a
    // last resort (GeoJSON points with only coordinates) reverse-geocode the
    // point into a UK postcode so the NOT NULL postcode column is satisfied.
    let postcode =
      (raw.postcode ?? "").toString().trim().toUpperCase() ||
      extractPostcodeFromAddress(raw.address)
    if (!postcode && hasCoords) {
      postcode = await reverseGeocode(providedLat as number, providedLng as number)
    }

    if (!name || !postcode) {
      skipped++
      results.push({
        row: rowNum,
        name: name || "(no name)",
        postcode,
        status: "skipped",
        reason: !name ? "Missing name" : "Missing postcode",
      })
      continue
    }

    const body = normalizeBody(raw.certification_body)
    if (!body) {
      skipped++
      results.push({
        row: rowNum,
        name,
        postcode,
        status: "skipped",
        reason: `Invalid certification body "${raw.certification_body}" (expected HMC, HFA, BOTH or COMMUNITY)`,
      })
      continue
    }

    const coords = hasCoords
      ? { latitude: providedLat as number, longitude: providedLng as number }
      : await geocodeLocation(postcode)
    if (!coords) {
      skipped++
      results.push({
        row: rowNum,
        name,
        postcode,
        status: "skipped",
        reason: "Could not geocode postcode",
      })
      continue
    }

    const rawCuisine = (raw.cuisine_type ?? "").toString().trim() || "Restaurant/Takeaway"
    const { cuisineType, cuisineGroup } = resolveCuisine({ name, cuisineType: rawCuisine })

    const address = (raw.address ?? "").toString().trim() || postcode
    const ratingInfo = await fetchPlaceRating({ name, address, postcode })
    const record = {
      name,
      address,
      postcode,
      latitude: coords.latitude,
      longitude: coords.longitude,
      cuisine_type: cuisineType,
      cuisine_group: cuisineGroup,
      certification_body: body,
      certification_status: normalizeStatus(raw.certification_status),
      last_scraped_date: new Date().toISOString().slice(0, 10),
      source: (raw.source ?? "").toString().trim() || "Manual upload",
      google_maps_url: buildGoogleMapsUrl({ name, address, postcode }),
      ...(ratingInfo && { rating: ratingInfo.rating, review_count: ratingInfo.reviewCount }),
    }

    // Dedupe on name + postcode (case-insensitive).
    const { data: existing } = await supabase
      .from("restaurants")
      .select("id")
      .ilike("name", name)
      .eq("postcode", postcode)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await supabase.from("restaurants").update(record).eq("id", existing.id)
      if (error) {
        skipped++
        results.push({ row: rowNum, name, postcode, status: "skipped", reason: error.message })
      } else {
        updated++
        results.push({ row: rowNum, name, postcode, status: "updated" })
      }
    } else {
      const { error } = await supabase.from("restaurants").insert(record)
      if (error) {
        skipped++
        results.push({ row: rowNum, name, postcode, status: "skipped", reason: error.message })
      } else {
        inserted++
        results.push({ row: rowNum, name, postcode, status: "inserted" })
      }
    }
  }

  if (inserted > 0 || updated > 0) {
    revalidatePath("/")
  }

  return { inserted, updated, skipped, results }
}

// ---------------------------------------------------------------------------
// On-demand import from the HalalAPI (halal-api.vercel.app), scoped to one area
// ---------------------------------------------------------------------------

const HALAL_API_BASE = "https://halal-api.vercel.app/api/v1/locations"
const HALAL_API_SOURCE = "HalalAPI (halal-api.vercel.app)"

export interface ApiImportSummary {
  area: string
  fetched: number
  inserted: number
  skippedExisting: number
  skippedUngeocoded: number
  error?: string
}

/** Bulk-geocode UK postcodes via postcodes.io (<=100 per request). */
async function bulkGeocode(postcodes: string[]): Promise<Map<string, Coordinates>> {
  const coords = new Map<string, Coordinates>()
  for (let i = 0; i < postcodes.length; i += 100) {
    const batch = postcodes.slice(i, i + 100)
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: batch }),
      })
      if (res.ok) {
        const json = await res.json()
        for (const entry of json.result ?? []) {
          if (entry.result) {
            coords.set(String(entry.query).toUpperCase(), {
              latitude: entry.result.latitude,
              longitude: entry.result.longitude,
            })
          }
        }
      }
    } catch {
      // Best-effort — ungeocoded venues are skipped below.
    }
  }
  return coords
}

/**
 * Import halal venues from the HalalAPI around a single area (postcode or place
 * name). The API is Foursquare-sourced and unverified, so every row is stored
 * as a COMMUNITY / Unverified tier and existing HMC/HFA rows are never touched
 * (dedupe on fsq_id, then name + postcode). Scoped to one area so it completes
 * quickly within a server action — the standalone script sweeps the whole UK.
 */
export async function importFromApi(
  areaRaw: string,
  radiusMiles: number,
): Promise<ApiImportSummary> {
  const area = (areaRaw ?? "").trim()
  const base: ApiImportSummary = {
    area,
    fetched: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedUngeocoded: 0,
  }

  if (!area) return { ...base, error: "Enter an area — a UK postcode or place name." }

  const apiKey = process.env.HALAL_API_KEY
  if (!apiKey) return { ...base, error: "HALAL_API_KEY is not configured." }

  // 1. Resolve the area to coordinates (the API returns null lat/lng itself).
  const centre = await geocodeLocation(area)
  if (!centre) {
    return { ...base, error: `Could not find "${area}". Try a UK postcode or place name.` }
  }

  // 2. Query the API by lat/lng. Radius in metres, capped for reliability
  //    (large radii time out upstream).
  const radiusM = Math.min(Math.max(Math.round(radiusMiles * 1609.34), 500), 8000)
  let rows: Array<Record<string, unknown>> = []
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45000)
    const res = await fetch(
      `${HALAL_API_BASE}?lat=${centre.latitude}&lng=${centre.longitude}&radius=${radiusM}`,
      { headers: { "x-api-key": apiKey }, signal: controller.signal },
    )
    clearTimeout(timer)
    if (!res.ok) {
      return { ...base, error: `The halal API returned HTTP ${res.status}. Try again shortly.` }
    }
    const json = await res.json()
    rows = json.data ?? json.results ?? []
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError"
    return {
      ...base,
      error: timedOut
        ? "The halal API timed out. Try a smaller radius or retry."
        : "The halal API request failed. Try again shortly.",
    }
  }

  base.fetched = rows.length
  if (rows.length === 0) return base

  // 3. Normalise + dedupe venues within this batch.
  const norm = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim()
  const seen = new Set<string>()
  const venues: Array<{
    fsq_id: string | null
    name: string
    address: string
    postcode: string
    cuisine_type: string
  }> = []
  for (const v of rows) {
    const name = norm(v.name)
    const postcode = norm(v.postcode).toUpperCase()
    if (!name || !postcode) continue
    const fsqId = (v.fsq_id as string) ?? null
    const id = fsqId ?? `${name}|${postcode}`
    if (seen.has(id)) continue
    seen.add(id)
    venues.push({
      fsq_id: fsqId,
      name,
      address: norm(v.address) || name,
      postcode,
      cuisine_type: norm(v.cuisine_type) || "Restaurant/Takeaway",
    })
  }

  // 4. Geocode venue postcodes in bulk.
  const coords = await bulkGeocode([...new Set(venues.map((v) => v.postcode))])

  // 5. Load existing rows for dedupe, then insert only new COMMUNITY rows.
  const supabase = createAdminClient()
  const { data: existing, error: readErr } = await supabase
    .from("restaurants")
    .select("name, postcode, fsq_id")
  if (readErr) return { ...base, error: `Database read failed: ${readErr.message}` }

  const existingFsq = new Set<string>()
  const existingNamePostcode = new Set<string>()
  for (const r of existing ?? []) {
    if (r.fsq_id) existingFsq.add(r.fsq_id)
    existingNamePostcode.add(
      `${(r.name ?? "").toLowerCase()}|${(r.postcode ?? "").toLowerCase()}`,
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const toInsert = []
  for (const v of venues) {
    const coord = coords.get(v.postcode)
    if (!coord) {
      base.skippedUngeocoded++
      continue
    }
    if (v.fsq_id && existingFsq.has(v.fsq_id)) {
      base.skippedExisting++
      continue
    }
    const key = `${v.name.toLowerCase()}|${v.postcode.toLowerCase()}`
    if (existingNamePostcode.has(key)) {
      base.skippedExisting++
      continue
    }
    const { cuisineType, cuisineGroup } = resolveCuisine({ name: v.name, cuisineType: v.cuisine_type })
    const ratingInfo = await fetchPlaceRating({ name: v.name, address: v.address, postcode: v.postcode })
    toInsert.push({
      name: v.name,
      address: v.address,
      postcode: v.postcode,
      cuisine_type: cuisineType,
      cuisine_group: cuisineGroup,
      certification_body: "COMMUNITY",
      certification_status: "Unverified",
      last_scraped_date: today,
      source: HALAL_API_SOURCE,
      fsq_id: v.fsq_id,
      latitude: coord.latitude,
      longitude: coord.longitude,
      google_maps_url: buildGoogleMapsUrl({ name: v.name, address: v.address, postcode: v.postcode }),
      ...(ratingInfo && { rating: ratingInfo.rating, review_count: ratingInfo.reviewCount }),
    })
    existingNamePostcode.add(key)
    if (v.fsq_id) existingFsq.add(v.fsq_id)
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("restaurants").insert(toInsert)
    if (error) return { ...base, error: `Insert failed: ${error.message}` }
    base.inserted = toInsert.length
    revalidatePath("/")
  }

  return base
}

// ---------------------------------------------------------------------------
// Duplicate detection & removal (admin)
// ---------------------------------------------------------------------------

/** A single restaurant summarised for the de-dupe preview UI. */
export interface DedupeEntry {
  id: string
  name: string
  address: string
  postcode: string
  certification_body: string
  rating: number | null
  review_count: number | null
  source: string | null
}

/** One group of duplicates: the row we keep plus the rows we'd remove. */
export interface DedupeClusterView {
  keep: DedupeEntry
  remove: DedupeEntry[]
}

export interface DedupePreview {
  totalRestaurants: number
  clusters: DedupeClusterView[]
  duplicateCount: number
}

function toDedupeEntry(r: Restaurant): DedupeEntry {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    postcode: r.postcode,
    certification_body: r.certification_body,
    rating: r.rating ?? null,
    review_count: r.review_count ?? null,
    source: r.source ?? null,
  }
}

/**
 * Scan the whole table and return the duplicate clusters found by matching on
 * postcode + shared name words. Read-only — nothing is deleted here, so the
 * admin can review exactly what would be removed before confirming.
 */
export async function previewDuplicates(): Promise<DedupePreview> {
  if (!(await isAdmin())) {
    return { totalRestaurants: 0, clusters: [], duplicateCount: 0 }
  }

  const restaurants = await fetchRestaurants()
  const clusters = findDuplicateClusters(restaurants)

  return {
    totalRestaurants: restaurants.length,
    duplicateCount: clusters.reduce((sum, c) => sum + c.remove.length, 0),
    clusters: clusters.map((c) => ({
      keep: toDedupeEntry(c.keep),
      remove: c.remove.map(toDedupeEntry),
    })),
  }
}

export interface DedupeResult {
  deleted: number
  error?: string
}

/**
 * Delete the given restaurant rows. The ids come from a previewDuplicates()
 * result the admin has reviewed. Uses the service-role client (RLS-bypassing),
 * so it stays admin-gated and server-only.
 */
export async function deleteDuplicates(ids: string[]): Promise<DedupeResult> {
  if (!(await isAdmin())) {
    return { deleted: 0, error: "Not authorised." }
  }

  const clean = [...new Set(ids)].filter((id) => typeof id === "string" && id.length > 0)
  if (clean.length === 0) return { deleted: 0 }

  const supabase = createAdminClient()

  // Process in batches to keep each request well within PostgREST limits.
  const BATCH = 200
  let deleted = 0
  for (let i = 0; i < clean.length; i += BATCH) {
    const batch = clean.slice(i, i + BATCH)

    // 1. Read the full rows so we can copy them into the archive verbatim.
    const { data: rows, error: readError } = await supabase
      .from("restaurants")
      .select("*")
      .in("id", batch)
    if (readError) return { deleted, error: readError.message }
    if (!rows || rows.length === 0) continue

    // 2. Archive them into deleted_restaurants before removing. The archive
    // table has its own archive_id/deleted_at defaults, so we insert the
    // original columns as-is plus a reason.
    const archiveRows = rows.map((row) => ({
      ...row,
      deleted_reason: "Removed by admin de-dupe tool",
    }))
    const { error: archiveError } = await supabase
      .from("deleted_restaurants")
      .insert(archiveRows)
    if (archiveError) return { deleted, error: `Archive failed: ${archiveError.message}` }

    // 3. Only delete rows we successfully archived.
    const archivedIds = rows.map((row) => row.id)
    const { error, count } = await supabase
      .from("restaurants")
      .delete({ count: "exact" })
      .in("id", archivedIds)
    if (error) return { deleted, error: error.message }
    deleted += count ?? archivedIds.length
  }

  revalidatePath("/")
  return { deleted }
}
