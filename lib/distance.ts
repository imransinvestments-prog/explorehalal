// Geospatial helpers shared by the app (client and server). Geocoding uses
// keyless public services so it works in the browser without exposing an API
// key: postcodes.io for UK postcodes/outcodes, with an OpenStreetMap Nominatim
// fallback for place/area names.

export interface Coordinates {
  latitude: number
  longitude: number
}

// Rough geographic centre of the UK (London) — used as the map's default view
// before the visitor has searched or shared their location.
export const DEFAULT_COORDS: Coordinates = {
  latitude: 51.5074,
  longitude: -0.1278,
}

const EARTH_RADIUS_MILES = 3958.8

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

// Great-circle distance between two points, in miles.
export function haversineDistanceMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i

function normalizePostcode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase()
}

async function geocodePostcodesIo(query: string): Promise<Coordinates | null> {
  const trimmed = query.trim()
  const compact = normalizePostcode(trimmed)

  try {
    if (FULL_POSTCODE.test(trimmed)) {
      const res = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`,
      )
      if (res.ok) {
        const json = await res.json()
        const r = json?.result
        if (r?.latitude != null && r?.longitude != null) {
          return { latitude: r.latitude, longitude: r.longitude }
        }
      }
    }

    if (OUTCODE.test(trimmed)) {
      const res = await fetch(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(compact)}`,
      )
      if (res.ok) {
        const json = await res.json()
        const r = json?.result
        if (r?.latitude != null && r?.longitude != null) {
          return { latitude: r.latitude, longitude: r.longitude }
        }
      }
    }
  } catch {
    // fall through to Nominatim
  }

  return null
}

async function geocodeNominatim(query: string): Promise<Coordinates | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", query)
    url.searchParams.set("format", "json")
    // No country restriction: allow international places (e.g. Berlin) to
    // resolve, not just UK locations.
    url.searchParams.set("limit", "1")

    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "en" },
    })
    if (!res.ok) return null

    const json = await res.json()
    const first = Array.isArray(json) ? json[0] : null
    if (first?.lat && first?.lon) {
      return {
        latitude: Number.parseFloat(first.lat),
        longitude: Number.parseFloat(first.lon),
      }
    }
  } catch {
    // ignore
  }

  return null
}

// Resolve a UK postcode, outward code, or place/area name to coordinates.
// Returns null when the location can't be found.
export async function geocodeLocation(
  query: string,
): Promise<Coordinates | null> {
  const trimmed = (query ?? "").trim()
  if (!trimmed) return null

  const viaPostcode = await geocodePostcodesIo(trimmed)
  if (viaPostcode) return viaPostcode

  return geocodeNominatim(trimmed)
}
