import "server-only"
import { unstable_cache } from "next/cache"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
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

/**
 * PostgREST caps every response at a fixed maximum number of rows (1000 by
 * default), so a single `.select()` silently truncates the table. We page
 * through with `.range()` until a short page signals the end. Without this,
 * only the first 1000 rows (alphabetically by name) ever reach the UI or the
 * CSV/XLSX export.
 */
const PAGE_SIZE = 1000

/** Cache tag for the public restaurant list; invalidate it after any write. */
export const RESTAURANTS_TAG = "restaurants"

type PageFetcher = (from: number) => Promise<Restaurant[]>

/** Page through the table with retries. A page fetcher throws on error. */
async function fetchAllPages(fetchPage: PageFetcher): Promise<Restaurant[]> {
  let lastError = ""
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const all: Restaurant[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = await fetchPage(from)
        all.push(...page)
        if (page.length < PAGE_SIZE) break
      }
      // Pages can be cached at slightly different moments, so a row that moved
      // across a page boundary could appear twice. Keep the first copy.
      const seen = new Set<string>()
      return all
        .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
        .map(normalizeRestaurant)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.log(`[v0] fetchRestaurants attempt ${attempt}/${MAX_ATTEMPTS} failed:`, lastError)
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500))
      }
    }
  }

  console.log("[v0] Failed to fetch restaurants after retries:", lastError)
  return []
}

/** Always-fresh list for admin tools (export, dedupe). */
export async function fetchRestaurants(): Promise<Restaurant[]> {
  const supabase = await createClient()
  return fetchAllPages(async (from) => {
    const { data, error } = await supabase
      .from("restaurants")
      .select(COLUMNS)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    return (data ?? []) as Restaurant[]
  })
}

/**
 * One cached page of the public list. Cached per page because the Data Cache
 * skips entries over 2MB and the whole table can exceed that. Uses a
 * cookie-less anon client (cached functions can't read cookies; RLS allows
 * public read). Errors throw, so a failed page is never cached.
 */
const fetchCachedPage = unstable_cache(
  async (from: number): Promise<Restaurant[]> => {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await supabase
      .from("restaurants")
      .select(COLUMNS)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    return (data ?? []) as Restaurant[]
  },
  ["restaurants-page"],
  // Admin writes invalidate the tag immediately; the hour covers the
  // maintenance scripts in scripts/, which write to Supabase directly.
  { tags: [RESTAURANTS_TAG], revalidate: 3600 },
)

/** Cached list for the public finder page. */
export function fetchRestaurantsCached(): Promise<Restaurant[]> {
  return fetchAllPages(fetchCachedPage)
}
