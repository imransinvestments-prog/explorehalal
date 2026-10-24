import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { fetchPlacePhotoName, resolvePhotoUri } from "@/lib/google-places.mjs"

/**
 * Redirects to a fresh Google Places photo for a restaurant.
 *
 * Google photo URLs expire, so cards whose stored image_url is a Google one
 * load this route instead (see lib/restaurant-image.ts). It looks up the
 * venue's Place ID, asks Places for its first photo and redirects there.
 * Only the Place ID is stored, as Google's terms allow; the photo URL is not.
 *
 * Each uncached hit costs two Places API calls, so the redirect is cached at
 * the CDN for hours (Google serves photo URLs with a one-day max-age) and
 * query strings are rejected so they can't be used to bypass that cache.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GOOGLE_PHOTO_HOST = "lh3.googleusercontent.com"

const PHOTO_CACHE = "public, max-age=3600, s-maxage=21600, stale-while-revalidate=21600"
const NO_PHOTO_CACHE = "public, max-age=3600, s-maxage=86400"
const ERROR_CACHE = "public, max-age=60, s-maxage=300"

function plain(status: number, cacheControl: string) {
  return new NextResponse(null, { status, headers: { "Cache-Control": cacheControl } })
}

function hasGoogleImage(url: string | null): boolean {
  if (!url) return false
  try {
    return new URL(url).host === GOOGLE_PHOTO_HOST
  } catch {
    return false
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id) || new URL(request.url).search) {
    return plain(400, NO_PHOTO_CACHE)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await supabase
    .from("restaurants")
    .select("place_id, image_url")
    .eq("id", id)
    .maybeSingle()
  if (error) return plain(502, ERROR_CACHE)

  // Only venues whose card routes here; never spend API calls on the rest.
  if (!data?.place_id || !hasGoogleImage(data.image_url)) {
    return plain(404, NO_PHOTO_CACHE)
  }

  let upstreamFailed = false
  const onStatus = () => {
    upstreamFailed = true
  }
  const photoName = await fetchPlacePhotoName(data.place_id, { onStatus })
  const photoUri = photoName ? await resolvePhotoUri(photoName, { maxWidthPx: 800, onStatus }) : null

  if (!photoUri) {
    return plain(upstreamFailed ? 502 : 404, upstreamFailed ? ERROR_CACHE : NO_PHOTO_CACHE)
  }
  const response = NextResponse.redirect(photoUri, 302)
  response.headers.set("Cache-Control", PHOTO_CACHE)
  return response
}
