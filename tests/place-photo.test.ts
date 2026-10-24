import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  row: null as { place_id: string | null; image_url: string | null } | null,
  dbError: null as { message: string } | null,
  fetchPlacePhotoName: vi.fn(),
  resolvePhotoUri: vi.fn(),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.row, error: mocks.dbError }),
        }),
      }),
    }),
  }),
}))
vi.mock("@/lib/google-places.mjs", () => ({
  fetchPlacePhotoName: mocks.fetchPlacePhotoName,
  resolvePhotoUri: mocks.resolvePhotoUri,
}))

import { GET } from "@/app/api/place-photo/[id]/route"
import { cardImageSrc } from "@/lib/restaurant-image"

const ID = "0b6f1f9e-3c1a-4c55-9a43-1d2f3e4a5b6c"
const GOOGLE_URL = "https://lh3.googleusercontent.com/place-photos/expired=s800"

function call(id = ID, query = "") {
  return GET(new Request(`https://explorehalal.test/api/place-photo/${id}${query}`), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  mocks.row = { place_id: "ChIJplace", image_url: GOOGLE_URL }
  mocks.dbError = null
  mocks.fetchPlacePhotoName.mockReset().mockResolvedValue("places/ChIJplace/photos/abc")
  mocks.resolvePhotoUri.mockReset().mockResolvedValue("https://lh3.googleusercontent.com/fresh=s800")
})

describe("GET /api/place-photo/[id]", () => {
  it("redirects to a fresh photo and lets the CDN cache it", async () => {
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://lh3.googleusercontent.com/fresh=s800")
    expect(res.headers.get("cache-control")).toContain("s-maxage=21600")
    expect(mocks.fetchPlacePhotoName).toHaveBeenCalledWith("ChIJplace", expect.any(Object))
  })

  it("rejects ids that are not UUIDs and cache-busting query strings", async () => {
    expect((await call("not-a-uuid")).status).toBe(400)
    expect((await call(ID, "?v=2")).status).toBe(400)
    expect(mocks.fetchPlacePhotoName).not.toHaveBeenCalled()
  })

  it("returns 404 without calling Google when there is nothing to resolve", async () => {
    for (const row of [
      null,
      { place_id: null, image_url: GOOGLE_URL },
      { place_id: "ChIJplace", image_url: "https://example.supabase.co/storage/v1/object/public/restaurants/a.jpg" },
    ]) {
      mocks.row = row
      expect((await call()).status).toBe(404)
    }
    expect(mocks.fetchPlacePhotoName).not.toHaveBeenCalled()
  })

  it("returns 404 when the place has no photos", async () => {
    mocks.fetchPlacePhotoName.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it("returns a briefly cached 502 when Google fails", async () => {
    mocks.fetchPlacePhotoName.mockImplementation(async (_id: string, opts: { onStatus: (s: number) => void }) => {
      opts.onStatus(429)
      return null
    })
    const res = await call()
    expect(res.status).toBe(502)
    expect(res.headers.get("cache-control")).toContain("s-maxage=300")
  })
})

describe("cardImageSrc", () => {
  it("routes Google photo URLs through /api/place-photo", () => {
    expect(cardImageSrc({ id: ID, image_url: GOOGLE_URL })).toBe(`/api/place-photo/${ID}`)
  })

  it("uses our own stored images as they are", () => {
    const url = "https://unwnizjdwwocfcraylat.supabase.co/storage/v1/object/public/restaurants/a.jpg"
    expect(cardImageSrc({ id: ID, image_url: url })).toBe(url)
  })

  it("returns null for a missing or malformed URL", () => {
    expect(cardImageSrc({ id: ID, image_url: null })).toBeNull()
    expect(cardImageSrc({ id: ID, image_url: "not a url" })).toBeNull()
  })
})
