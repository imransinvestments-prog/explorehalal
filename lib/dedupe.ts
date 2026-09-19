import type { Restaurant } from "./types"

/**
 * Duplicate detection for the restaurants table.
 *
 * Two rows are treated as the same venue when they share the SAME postcode and
 * their names contain TWO OR MORE of the same significant words. "Significant"
 * excludes generic filler (connectors like "the"/"and" and catch-all terms
 * like "restaurant"/"takeaway") so a single shared generic word can't merge two
 * genuinely different venues.
 */

/** Minimum number of shared significant name words for two rows to be duplicates. */
export const SHARED_WORD_THRESHOLD = 2

/**
 * Generic words that shouldn't count towards the shared-word match. These are
 * connectors and catch-all venue terms that appear across many unrelated
 * venues, so matching on them alone would cause false merges.
 */
const STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "a",
  "an",
  "at",
  "in",
  "on",
  "to",
  "for",
  "ltd",
  "limited",
  "restaurant",
  "restaurants",
  "takeaway",
  "takeaways",
])

/** Normalise a postcode for grouping: uppercase, no internal spaces. */
export function normalizePostcode(postcode: string): string {
  return (postcode ?? "").toUpperCase().replace(/\s+/g, "")
}

/**
 * Break a name into its set of significant lowercase words. Punctuation and
 * ampersands become separators, stop words are dropped, and single characters
 * are ignored (e.g. "M" in "Mangal M 2").
 */
export function significantWords(name: string): Set<string> {
  const words = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
  return new Set(words)
}

/** Count how many significant words two names share. */
export function sharedWordCount(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const word of a) {
    if (b.has(word)) count++
  }
  return count
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
 * Group restaurants into duplicate clusters. Rows are first bucketed by
 * normalised postcode; within each bucket a union-find joins any two rows whose
 * names share at least SHARED_WORD_THRESHOLD significant words (transitively, so
 * A~B and B~C place A, B and C in one cluster). Only clusters with more than one
 * row are returned.
 */
export function findDuplicateClusters(restaurants: Restaurant[]): DuplicateCluster[] {
  const byPostcode = new Map<string, Restaurant[]>()
  for (const r of restaurants) {
    const key = normalizePostcode(r.postcode)
    if (!key) continue
    const bucket = byPostcode.get(key)
    if (bucket) bucket.push(r)
    else byPostcode.set(key, [r])
  }

  const clusters: DuplicateCluster[] = []

  for (const bucket of byPostcode.values()) {
    if (bucket.length < 2) continue

    const words = bucket.map((r) => significantWords(r.name))
    const parent = bucket.map((_, i) => i)
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    const union = (i: number, j: number) => {
      const ri = find(i)
      const rj = find(j)
      if (ri !== rj) parent[ri] = rj
    }

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (sharedWordCount(words[i], words[j]) >= SHARED_WORD_THRESHOLD) {
          union(i, j)
        }
      }
    }

    const groups = new Map<number, Restaurant[]>()
    for (let i = 0; i < bucket.length; i++) {
      const root = find(i)
      const group = groups.get(root)
      if (group) group.push(bucket[i])
      else groups.set(root, [bucket[i]])
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue
      const keep = pickCanonical(group)
      clusters.push({
        keep,
        remove: group.filter((r) => r.id !== keep.id),
      })
    }
  }

  return clusters
}
