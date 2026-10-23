import { describe, expect, it } from "vitest"
import { haversineDistanceMiles } from "@/lib/distance"

const LONDON = { latitude: 51.5074, longitude: -0.1278 }
const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 }

describe("haversineDistanceMiles", () => {
  it("is zero for the same point", () => {
    expect(haversineDistanceMiles(LONDON, LONDON)).toBe(0)
  })

  it("matches the known London–Manchester great-circle distance (~163 mi)", () => {
    expect(haversineDistanceMiles(LONDON, MANCHESTER)).toBeCloseTo(163, 0)
  })

  it("is symmetric", () => {
    expect(haversineDistanceMiles(LONDON, MANCHESTER)).toBe(haversineDistanceMiles(MANCHESTER, LONDON))
  })
})
