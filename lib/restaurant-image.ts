import type { Restaurant } from "./types"

const GOOGLE_PHOTO_HOST = "lh3.googleusercontent.com"

/**
 * The image URL a restaurant card should load. Stored Google Places photo URLs
 * expire, so those go through /api/place-photo, which resolves a fresh one from
 * the venue's Place ID. Anything else (our own storage) is used as stored.
 */
export function cardImageSrc(restaurant: Pick<Restaurant, "id" | "image_url">): string | null {
  const url = restaurant.image_url
  if (!url) return null
  try {
    if (new URL(url).host === GOOGLE_PHOTO_HOST) {
      return `/api/place-photo/${encodeURIComponent(restaurant.id)}`
    }
  } catch {
    return null
  }
  return url
}
