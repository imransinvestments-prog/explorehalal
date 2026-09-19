export type CertificationBody = "HMC" | "HFA" | "BOTH" | "COMMUNITY"

/**
 * Coarse, filterable certification tier stored per row. Independent of the
 * finer-grained `certification_body`: a venue certified by both bodies is
 * still classed as "HMC" here, and everything unverified is "Other"
 * (surfaced in the UI as "Self-certified").
 */
export type CertificationType = "HMC" | "HFA" | "Other"

/** UI label for each stored certification type. */
export const CERTIFICATION_TYPE_LABELS: Record<CertificationType, string> = {
  HMC: "HMC",
  HFA: "HFA",
  Other: "Self-certified",
}

export type CertificationStatus =
  | "Certified"
  | "Pending"
  | "Expired"
  | "Suspended"
  | "Unverified"

export interface Restaurant {
  id: string
  name: string
  address: string
  postcode: string
  latitude: number
  longitude: number
  cuisine_type: string
  /** Canonical cuisine group derived from cuisine_type (see lib/cuisine-groups). */
  cuisine_group?: string | null
  /** Which body/bodies certify this restaurant. "BOTH" means HMC + HFA. */
  certification_body: CertificationBody
  /** Coarse certification tier used by the UI filter: HMC, HFA, or Other. */
  certification_type: CertificationType
  certification_status: CertificationStatus
  last_scraped_date: string
  /** Where this row's certification claim came from (directory scrape, chain locator, etc.). */
  source?: string | null
  /** Google Maps search URL resolving this restaurant by name + address. */
  google_maps_url?: string | null
  /** Aggregate Google star rating (0–5), if known. */
  rating?: number | null
  /** Number of Google reviews backing the rating, if known. */
  review_count?: number | null
  /** Displayable Google Places photo URL for this venue, if known. */
  image_url?: string | null
}

/** A restaurant augmented with its computed distance from a searched postcode. */
export interface RestaurantWithDistance extends Restaurant {
  distanceMiles: number
}

export const CUISINE_TYPES = [
  "Pakistani",
  "Indian",
  "Bangladeshi",
  "Turkish",
  "Middle Eastern",
  "Lebanese",
  "Afghan",
  "Persian",
  "Malaysian",
] as const

export const DISTANCE_OPTIONS = [1, 3, 5, 10, 25, 50, 100] as const
