// Builds a stable Google Maps search URL for a restaurant. Uses the universal
// Maps URL scheme (no API key required), which resolves the place from its
// name + address text. Shared by the app (TS) and the import scripts (.mjs) so
// every ingest path generates identical URLs.

export function buildGoogleMapsUrl({ name, address, postcode } = {}) {
  const clean = (v) => (v ?? "").toString().replace(/\s+/g, " ").trim()
  const n = clean(name)
  const addr = clean(address)
  const pc = clean(postcode)

  const parts = []
  if (n) parts.push(n)
  if (addr) parts.push(addr)
  // Only append the postcode when it isn't already part of the address.
  if (pc && !addr.toUpperCase().includes(pc.toUpperCase())) parts.push(pc)

  const query = parts.join(", ")
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
