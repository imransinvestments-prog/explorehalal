// Shared Google Places lookup for star ratings + review counts.
//
// Uses the Places API (New) Text Search endpoint, which resolves a venue from
// its name + address and returns the aggregate `rating` (0–5) and
// `userRatingCount`. Pure JS so both the TypeScript app and the .mjs import
// scripts share one implementation.
//
// Requires GOOGLE_PLACES_API_KEY in the environment. All failures resolve to
// null so ratings are strictly best-effort and never break an import.

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const PHOTO_BASE = "https://places.googleapis.com/v1"

/** Prefer the unrestricted server key; the referrer-restricted GCP_API_KEY fails server-side. */
function resolveApiKey(explicit) {
  return (
    explicit ??
    process.env.GCP_API_KEY_2 ??
    process.env.GCP_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY
  )
}

/**
 * @param {{ name: string, address?: string, postcode?: string }} venue
 * @param {{ apiKey?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ rating: number, reviewCount: number, photoName: string | null } | null>}
 */
export async function fetchPlaceRating(venue, opts = {}) {
  const apiKey = resolveApiKey(opts.apiKey)
  if (!apiKey) return null

  const name = String(venue?.name ?? "").trim()
  if (!name) return null

  const parts = [name, venue?.address, venue?.postcode]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
  const textQuery = [...new Set(parts)].join(", ")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000)
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Restrict to the UK and only fetch the fields we store.
        "X-Goog-FieldMask": "places.rating,places.userRatingCount,places.photos",
      },
      body: JSON.stringify({
        textQuery,
        regionCode: "GB",
        languageCode: "en",
        maxResultCount: 1,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      // Let callers react to quota/rate-limit responses without changing the
      // null contract the import paths rely on.
      if (typeof opts.onStatus === "function") opts.onStatus(res.status)
      return null
    }
    const json = await res.json()
    const place = json?.places?.[0]
    if (!place) return null

    const rating = typeof place.rating === "number" ? place.rating : null
    const reviewCount =
      typeof place.userRatingCount === "number" ? place.userRatingCount : null
    const photoName =
      typeof place?.photos?.[0]?.name === "string" ? place.photos[0].name : null
    if (rating == null && reviewCount == null && photoName == null) return null

    return {
      rating: rating ?? 0,
      reviewCount: reviewCount ?? 0,
      photoName,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolves a Places photo resource name (e.g. "places/ID/photos/REF") to a
 * directly-displayable image URL. Using `skipHttpRedirect=true` returns JSON
 * with a `photoUri` on googleusercontent.com that renders without an API key,
 * so it's safe to store in the DB and put straight into an <img src>.
 *
 * @param {string | null | undefined} photoName
 * @param {{ apiKey?: string, timeoutMs?: number, maxWidthPx?: number, onStatus?: (status: number) => void }} [opts]
 * @returns {Promise<string | null>}
 */
export async function resolvePhotoUri(photoName, opts = {}) {
  const apiKey = resolveApiKey(opts.apiKey)
  if (!apiKey || !photoName) return null

  const maxWidthPx = opts.maxWidthPx ?? 800
  const url = `${PHOTO_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000)
  try {
    const res = await fetch(url, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: controller.signal,
    })
    if (!res.ok) {
      if (typeof opts.onStatus === "function") opts.onStatus(res.status)
      return null
    }
    const json = await res.json()
    return typeof json?.photoUri === "string" ? json.photoUri : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
