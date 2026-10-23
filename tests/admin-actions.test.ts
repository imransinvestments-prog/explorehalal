import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  geocodeLocation: vi.fn(),
  fetchPlaceRating: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  ADMIN_COOKIE: "admin_session",
  ADMIN_COOKIE_OPTIONS: {},
  createSessionToken: vi.fn(),
  verifyPassword: vi.fn(),
  isAdmin: mocks.isAdmin,
}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/distance", () => ({ geocodeLocation: mocks.geocodeLocation }))
vi.mock("@/lib/google-places.mjs", () => ({ fetchPlaceRating: mocks.fetchPlaceRating }))
vi.mock("@/lib/restaurants-server", () => ({ fetchRestaurants: vi.fn(), RESTAURANTS_TAG: "restaurants" }))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))

import { importFromApi, uploadRestaurants } from "@/app/actions"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", mocks.fetch)
  vi.stubEnv("HALAL_API_KEY", "test-key")
})

function expectNoPrivilegedWork() {
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
  expect(mocks.geocodeLocation).not.toHaveBeenCalled()
  expect(mocks.fetchPlaceRating).not.toHaveBeenCalled()
  expect(mocks.fetch).not.toHaveBeenCalled()
}

describe("admin-only server actions reject anonymous callers", () => {
  beforeEach(() => mocks.isAdmin.mockResolvedValue(false))

  it("uploadRestaurants", async () => {
    const result = await uploadRestaurants([{ name: "Evil Grill", postcode: "E1 6AN" }])
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0, results: [], error: "Not authorised." })
    expectNoPrivilegedWork()
  })

  it("importFromApi", async () => {
    const result = await importFromApi("E1 6AN", 2)
    expect(result.error).toBe("Not authorised.")
    expect(result.inserted).toBe(0)
    expectNoPrivilegedWork()
  })
})

describe("admin callers still reach the import logic", () => {
  beforeEach(() => mocks.isAdmin.mockResolvedValue(true))

  it("importFromApi proceeds past the gate to geocoding", async () => {
    mocks.geocodeLocation.mockResolvedValue(null)
    const result = await importFromApi("Nowhereville", 2)
    expect(mocks.geocodeLocation).toHaveBeenCalledWith("Nowhereville")
    expect(result.error).toMatch(/Could not find/)
  })

  it("uploadRestaurants proceeds past the gate to the database client", async () => {
    mocks.createAdminClient.mockReturnValue({})
    const result = await uploadRestaurants([])
    expect(mocks.createAdminClient).toHaveBeenCalledOnce()
    expect(result.error).toBeUndefined()
  })
})
