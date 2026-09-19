import type { Restaurant } from "./types"

/**
 * Duplicate detection for the restaurants table.
 *
 * Two rows are treated as the same venue when they resolve to the same physical
 * location. Real-world address strings for the same place are written many
 * different ways ("226 Great West Road, London, Greater London, TW5 9AW" vs
 * "226 Great West Rd, Hounslow TW5 9AW"), so exact string comparison misses
 * obvious duplicates. Instead we build a location key from the two most stable
 * parts of an address: the postcode and the building/house number. When both
 * are present that key is used; otherwise we fall back to a fully normalised
 * address string so rows without a postcode can still match on identical text.
 */

/**
 * Normalise an address for grouping: lowercase, expand a few common street-type
 * abbreviations (rd -> road, st -> street, ...), strip punctuation, collapse
 * runs of whitespace and trim. Returns an empty string when there is nothing
 * meaningful to compare (such rows are excluded from duplicate detection).
 */
export function normalizeAddress(address: string | null | undefined): string {
  return (address ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\brd\b/g, "road")
    .replace(/\bst\b/g, "street")
    .replace(/\bave\b/g, "avenue")
    .replace(/\bln\b/g, "lane")
    .replace(/\bdr\b/g, "drive")
    .replace(/\bpl\b/g, "place")
    .replace(/\bct\b/g, "court")
}

/** Normalise a postcode for comparison: uppercase, no spaces. */
export function normalizePostcode(postcode: string | null | undefined): string {
  return (postcode ?? "").toUpperCase().replace(/\s+/g, "")
}

/**
 * Extract the leading building/house number from an address, e.g.
 * "226 Great West Rd" -> "226" and "41-43 Lisson Grove" -> "41". Returns an
 * empty string when the address does not start with a number.
 */
export function houseNumber(address: string | null | undefined): string {
  const match = (address ?? "").trim().match(/^(\d+)/)
  return match ? match[1] : ""
}

/**
 * A UK postcode can appear inside the free-text address instead of the postcode
 * column. Pull the last postcode-looking token out of an address so we can
 * still key on it when the dedicated postcode field is blank.
 */
function postcodeFromAddress(address: string | null | undefined): string {
  const matches = (address ?? "").toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/g)
  return matches && matches.length > 0 ? normalizePostcode(matches[matches.length - 1]) : ""
}

/**
 * Build the location key used to group duplicates. Prefers postcode + house
 * number (stable across formatting differences); falls back to the normalised
 * full address when a postcode is unavailable. Returns an empty string when
 * there is nothing meaningful to compare.
 */
export function locationKey(restaurant: Restaurant): string {
  const postcode = normalizePostcode(restaurant.postcode) || postcodeFromAddress(restaurant.address)
  const number = houseNumber(restaurant.address)
  if (postcode && number) return `pc:${postcode}|no:${number}`
  const normalized = normalizeAddress(restaurant.address)
  return normalized ? `addr:${normalized}` : ""
}

/**
 * Certification-body ranking used to decide which row in a duplicate cluster to
 * keep. A venue certified by both bodies outranks a single body, which in turn
 * outranks an unverified community listing.
 */
function bodyRank(body: string | null | undefined): number {
  switch (body) {
    case "BOTH":
      return 3
    case "HMC":
    case "HFA":
      return 2
    default:
      return 1
  }
}

/**
 * Pick the row to keep from a cluster of duplicates: the most trustworthy and
 * complete record wins. Order of preference: stronger certification, then a
 * known Google rating, then more reviews, then a photo, then a more recent
 * scrape. Ties fall back to the oldest id for determinism.
 */
export function pickCanonical(cluster: Restaurant[]): Restaurant {
  return [...cluster].sort((a, b) => {
    const body = bodyRank(b.certification_body) - bodyRank(a.certification_body)
    if (body !== 0) return body

    const rating = (b.rating != null ? 1 : 0) - (a.rating != null ? 1 : 0)
    if (rating !== 0) return rating

    const reviews = (b.review_count ?? 0) - (a.review_count ?? 0)
    if (reviews !== 0) return reviews

    const image = (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0)
    if (image !== 0) return image

    const scraped = (b.last_scraped_date ?? "").localeCompare(a.last_scraped_date ?? "")
    if (scraped !== 0) return scraped

    return (a.id ?? "").localeCompare(b.id ?? "")
  })[0]
}

export interface DuplicateCluster {
  keep: Restaurant
  remove: Restaurant[]
}

/**
 * Group restaurants into duplicate clusters by location key (postcode + house
 * number, falling back to normalised full address). Every set of two or more
 * rows that share the same key becomes one cluster; within it the most
 * complete/trusted row is kept and the rest are flagged for removal. Rows with
 * no usable address are ignored.
 */
export function findDuplicateClusters(restaurants: Restaurant[]): DuplicateCluster[] {
  const byLocation = new Map<string, Restaurant[]>()
  for (const r of restaurants) {
    const key = locationKey(r)
    if (!key) continue
    const bucket = byLocation.get(key)
    if (bucket) bucket.push(r)
    else byLocation.set(key, [r])
  }

  const clusters: DuplicateCluster[] = []

  for (const group of Array.from(byLocation.values())) {
    if (group.length < 2) continue
    const keep = pickCanonical(group)
    clusters.push({
      keep,
      remove: group.filter((r) => r.id !== keep.id),
    })
  }

  return clusters
}
