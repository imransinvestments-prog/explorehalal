import type { Restaurant } from "./types"

/**
 * Duplicate detection for the restaurants table.
 *
 * Two rows are treated as the same venue when they share the SAME address.
 * Addresses are normalised (lowercased, punctuation stripped, whitespace
 * collapsed) before comparison so trivial formatting differences ("12 High St."
 * vs "12 High Street") that are otherwise identical still group together only
 * when they truly match. Rows with a blank address are never grouped.
 */

/**
 * Normalise an address for grouping: lowercase, strip punctuation, collapse
 * runs of whitespace and trim. Returns an empty string when there is nothing
 * meaningful to compare (such rows are excluded from duplicate detection).
 */
export function normalizeAddress(address: string | null | undefined): string {
  return (address ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Normalise a postcode for display/secondary comparison: uppercase, no spaces. */
export function normalizePostcode(postcode: string): string {
  return (postcode ?? "").toUpperCase().replace(/\s+/g, "")
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
 * Group restaurants into duplicate clusters by normalised address. Every set of
 * two or more rows that share the same normalised address becomes one cluster;
 * within it the most complete/trusted row is kept and the rest are flagged for
 * removal. Rows with a blank address are ignored.
 */
export function findDuplicateClusters(restaurants: Restaurant[]): DuplicateCluster[] {
  const byAddress = new Map<string, Restaurant[]>()
  for (const r of restaurants) {
    const key = normalizeAddress(r.address)
    if (!key) continue
    const bucket = byAddress.get(key)
    if (bucket) bucket.push(r)
    else byAddress.set(key, [r])
  }

  const clusters: DuplicateCluster[] = []

  for (const group of byAddress.values()) {
    if (group.length < 2) continue
    const keep = pickCanonical(group)
    clusters.push({
      keep,
      remove: group.filter((r) => r.id !== keep.id),
    })
  }

  return clusters
}
