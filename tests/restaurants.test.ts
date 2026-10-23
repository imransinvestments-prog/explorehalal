import { describe, expect, it } from "vitest"
import { filterRestaurants } from "@/lib/restaurants"
import type { Restaurant } from "@/lib/types"

const ORIGIN = { latitude: 51.5074, longitude: -0.1278 } // central London

let nextId = 0
function restaurant(overrides: Partial<Restaurant>): Restaurant {
  nextId++
  return {
    id: `r${nextId}`,
    name: `Restaurant ${nextId}`,
    address: "1 High Street",
    postcode: "E1 6AN",
    latitude: ORIGIN.latitude,
    longitude: ORIGIN.longitude,
    cuisine_type: "Turkish",
    cuisine_group: "Turkish",
    certification_body: "HMC",
    certification_type: "HMC",
    certification_status: "Certified",
    last_scraped_date: "2026-10-01",
    rating: null,
    review_count: null,
    ...overrides,
  }
}

// Roughly 1, 3 and 10 miles north of the origin (1° latitude ≈ 69 miles).
const near = restaurant({ name: "Near Grill", latitude: ORIGIN.latitude + 1 / 69, rating: 4.1, review_count: 50 })
const mid = restaurant({
  name: "Mid Curry House",
  latitude: ORIGIN.latitude + 3 / 69,
  cuisine_type: "Pakistani",
  cuisine_group: "Pakistani",
  certification_body: "HFA",
  certification_type: "HFA",
  rating: 4.8,
  review_count: 10,
})
const far = restaurant({
  name: "Far Diner",
  latitude: ORIGIN.latitude + 10 / 69,
  certification_body: "COMMUNITY",
  certification_type: "Other",
  certification_status: "Unverified",
  rating: 4.8,
  review_count: 900,
})
const butcher = restaurant({
  name: "Al Noor Halal Meat",
  latitude: ORIGIN.latitude + 2 / 69,
  cuisine_type: "Butchers",
  cuisine_group: "Butchers",
})
const all = [far, butcher, mid, near]
const ids = (rs: { id: string }[]) => rs.map((r) => r.id)

describe("filterRestaurants", () => {
  it("returns everything with infinite distance when there is no origin", () => {
    const { restaurants } = filterRestaurants(all, { origin: null, maxDistanceMiles: 5, cuisineType: "all" })
    expect(restaurants).toHaveLength(all.length)
    expect(restaurants.every((r) => r.distanceMiles === Number.POSITIVE_INFINITY)).toBe(true)
  })

  it("filters by radius and sorts nearest first", () => {
    const { restaurants } = filterRestaurants(all, { origin: ORIGIN, maxDistanceMiles: 5, cuisineType: "all" })
    expect(ids(restaurants)).toEqual(ids([near, butcher, mid]))
    expect(restaurants[0].distanceMiles).toBeCloseTo(1, 1)
  })

  it("filters by cuisine group", () => {
    const { restaurants } = filterRestaurants(all, { origin: ORIGIN, maxDistanceMiles: 50, cuisineType: "Pakistani" })
    expect(ids(restaurants)).toEqual(ids([mid]))
  })

  it("filters by certification type", () => {
    const { restaurants } = filterRestaurants(all, {
      origin: ORIGIN,
      maxDistanceMiles: 50,
      cuisineType: "all",
      certificationTypes: ["Other"],
    })
    expect(ids(restaurants)).toEqual(ids([far]))
  })

  it("supports certified-only", () => {
    const { restaurants } = filterRestaurants(all, {
      origin: ORIGIN,
      maxDistanceMiles: 50,
      cuisineType: "all",
      certifiedOnly: true,
    })
    expect(ids(restaurants)).not.toContain(far.id)
  })

  it("shows only or excludes butchers", () => {
    const base = { origin: ORIGIN, maxDistanceMiles: 50, cuisineType: "all" as const }
    expect(ids(filterRestaurants(all, { ...base, butchers: "only" }).restaurants)).toEqual(ids([butcher]))
    expect(ids(filterRestaurants(all, { ...base, butchers: "exclude" }).restaurants)).not.toContain(butcher.id)
  })

  it("treats a 'meat' name as a butcher even when the stored group says otherwise", () => {
    const mislabelled = restaurant({ name: "A1 Halal Meats", cuisine_group: "Restaurant / Takeaway" })
    const { restaurants } = filterRestaurants([mislabelled], {
      origin: ORIGIN,
      maxDistanceMiles: 5,
      cuisineType: "all",
      butchers: "only",
    })
    expect(ids(restaurants)).toEqual([mislabelled.id])
  })

  it("sorts by rating, then review count, then distance, with unrated last", () => {
    const { restaurants } = filterRestaurants(all, {
      origin: ORIGIN,
      maxDistanceMiles: 50,
      cuisineType: "all",
      sortBy: "rating",
    })
    // far and mid tie on 4.8; far has more reviews. butcher is unrated.
    expect(ids(restaurants)).toEqual(ids([far, mid, near, butcher]))
  })
})
