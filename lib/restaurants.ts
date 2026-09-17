import type { CertificationType, Restaurant, RestaurantWithDistance } from "./types"
import { haversineDistanceMiles, type Coordinates } from "./distance"
import { groupCuisine, applyNameGroupOverride } from "@/lib/cuisine-groups.mjs"

/**
 * The canonical cuisine group for a restaurant. Starts from the stored value
 * (or a derivation from the raw label) and then applies name-based overrides,
 * so a "supermarket"/"foods" or "meat" venue always resolves to the right
 * group even if its stored value predates the rule.
 */
export function restaurantCuisineGroup(r: Restaurant): string {
  const base = r.cuisine_group ?? groupCuisine(r.cuisine_type)
  return applyNameGroupOverride(r.name, base)
}

/** Instant, toggle-style refinements applied on top of the main search. */
export type ButchersMode = "only" | "exclude" | null

/** How the result list is ordered. */
export type SortMode = "distance" | "rating"

export interface SearchParams {
  origin: Coordinates | null
  maxDistanceMiles: number
  cuisineType: string | "all"
  /** Restrict to HMC/HFA-certified venues (excludes unverified community rows). */
  certifiedOnly?: boolean
  /** Restrict to these certification types (HMC / HFA / Other). Empty = all. */
  certificationTypes?: CertificationType[]
  /** "only" shows just butchers, "exclude" hides them, null leaves them in. */
  butchers?: ButchersMode
  /** Order results by proximity (default) or by highest Google rating. */
  sortBy?: SortMode
}

/** True when a restaurant carries an HMC and/or HFA certification. */
export function isCertified(r: Restaurant): boolean {
  return (
    r.certification_body === "HMC" ||
    r.certification_body === "HFA" ||
    r.certification_body === "BOTH"
  )
}

/**
 * The stored certification type, falling back to a derivation from
 * `certification_body` for any legacy row that predates the column.
 */
export function certificationType(r: Restaurant): CertificationType {
  if (r.certification_type) return r.certification_type
  if (r.certification_body === "HMC" || r.certification_body === "BOTH") return "HMC"
  if (r.certification_body === "HFA") return "HFA"
  return "Other"
}

/** True when a restaurant is grouped as a butcher rather than a place to eat. */
export function isButcher(r: Restaurant): boolean {
  return restaurantCuisineGroup(r) === "Butchers"
}

export interface SearchResult {
  origin: Coordinates | null
  restaurants: RestaurantWithDistance[]
}

/**
 * Filter + sort a set of restaurants relative to a resolved search origin,
 * using the Haversine formula for distance. Pure and client-safe so it can run
 * against server-fetched data. Callers geocode the postcode first (async).
 */
export function filterRestaurants(
  restaurants: Restaurant[],
  {
    origin,
    maxDistanceMiles,
    cuisineType,
    certifiedOnly = false,
    certificationTypes = [],
    butchers = null,
    sortBy = "distance",
  }: SearchParams,
): SearchResult {
  const withDistance: RestaurantWithDistance[] = restaurants.map((r) => ({
    ...r,
    distanceMiles: origin
      ? haversineDistanceMiles(origin, {
          latitude: r.latitude,
          longitude: r.longitude,
        })
      : Number.POSITIVE_INFINITY,
  }))

  const filtered = withDistance
    .filter((r) => cuisineType === "all" || restaurantCuisineGroup(r) === cuisineType)
    .filter((r) => !certifiedOnly || isCertified(r))
    .filter((r) => certificationTypes.length === 0 || certificationTypes.includes(certificationType(r)))
    .filter((r) => {
      if (butchers === "only") return isButcher(r)
      if (butchers === "exclude") return !isButcher(r)
      return true
    })
    .filter((r) => !origin || r.distanceMiles <= maxDistanceMiles)
    .sort((a, b) => {
      if (sortBy === "rating") {
        // Highest rating first; unrated venues sink to the bottom.
        const ra = typeof a.rating === "number" ? a.rating : -1
        const rb = typeof b.rating === "number" ? b.rating : -1
        if (rb !== ra) return rb - ra
        // Tie-break on review volume, then proximity.
        const ca = typeof a.review_count === "number" ? a.review_count : 0
        const cb = typeof b.review_count === "number" ? b.review_count : 0
        if (cb !== ca) return cb - ca
        return a.distanceMiles - b.distanceMiles
      }
      return a.distanceMiles - b.distanceMiles
    })

  return { origin, restaurants: filtered }
}
