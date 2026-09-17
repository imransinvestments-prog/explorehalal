import "server-only"
import type { Restaurant } from "./types"
import { createClient } from "./supabase/server"

/**
 * Fetch all restaurants from the Supabase `restaurants` table. These rows
 * originate from the Halal Monitoring Committee (HMC) and Halal Food
 * Association (HFA) directories. Server-only (RLS allows public read).
 */
const COLUMNS =
  "id, name, address, postcode, latitude, longitude, cuisine_type, cuisine_group, certification_body, certification_type, certification_status, last_scraped_date, source, google_maps_url, rating, review_count, image_url"

const MAX_ATTEMPTS = 3

/**
 * Coerce a value to a finite number or null. Postgres `numeric` columns (e.g.
 * `rating`) are returned by PostgREST as strings to preserve precision, so
 * `rating` arrives as "4.6" rather than 4.6. Without this, every
 * `typeof rating === "number"` guard fails — stars never render and the
 * "Top rated" sort treats all venues as unrated.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Normalise the numeric fields that arrive as strings from PostgREST. */
function normalizeRestaurant(row: Restaurant): Restaurant {
  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    rating: toNumberOrNull(row.rating),
    review_count: toNumberOrNull(row.review_count),
  }
}

export async function fetchRestaurants(): Promise<Restaurant[]> {
  const supabase = await createClient()

  let lastError = ""
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.from("restaurants").select(COLUMNS).order("name", { ascending: true })

    if (!error) {
      return ((data ?? []) as Restaurant[]).map(normalizeRestaurant)
    }

    lastError = error.message
    console.log(`[v0] fetchRestaurants attempt ${attempt}/${MAX_ATTEMPTS} failed:`, error.message)

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }

  console.log("[v0] Failed to fetch restaurants after retries:", lastError)
  return []
}
