/**
 * Backfills `rating` + `review_count` for existing rows in the `restaurants`
 * table using the Google Places API (New) Text Search endpoint.
 *
 * Best-effort: venues Google can't resolve are left untouched (null rating).
 * Safe to re-run — pass --only-missing (default) to skip rows already rated,
 * or --all to refresh every row.
 *
 * Run:
 *   node --env-file=.env.development.local scripts/backfill-ratings.mjs
 *   node --env-file=.env.development.local scripts/backfill-ratings.mjs --all
 *   node --env-file=.env.development.local scripts/backfill-ratings.mjs --limit=100
 *
 * Env:
 *   GOOGLE_PLACES_API_KEY
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { fetchPlaceRating, resolvePhotoUri } from "../lib/google-places.mjs"

const args = process.argv.slice(2)
const REFRESH_ALL = args.includes("--all")
const limitArg = args.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_KEY =
  process.env.GCP_API_KEY_2 ?? process.env.GCP_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY

if (!API_KEY) {
  console.error("[ratings] Missing GCP_API_KEY_2 / GCP_API_KEY / GOOGLE_PLACES_API_KEY.")
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[ratings] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Page through all rows (Supabase caps a select at 1000).
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("restaurants")
      .select("id, name, address, postcode, rating, image_url")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    // Default pass: rows still missing a rating OR an image.
    if (!REFRESH_ALL) q = q.or("rating.is.null,image_url.is.null")
    const { data, error } = await q
    if (error) {
      console.error("[ratings] read failed:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
  }

  const target = rows.slice(0, LIMIT)
  console.log(`[ratings] ${target.length} row(s) to process${REFRESH_ALL ? " (refresh all)" : " (missing only)"}`)

  let rated = 0
  let imaged = 0
  let noMatch = 0
  let done = 0
  let quotaHit = false
  let authError = 0

  for (const r of target) {
    const info = await fetchPlaceRating(
      { name: r.name, address: r.address, postcode: r.postcode },
      {
        apiKey: API_KEY,
        onStatus: (status) => {
          if (status === 429) quotaHit = true
          if (status === 401 || status === 403) authError = status
        },
      },
    )
    if (authError) {
      console.error(
        `[ratings] Google Places rejected the API key (HTTP ${authError}) before any rows were rated. ` +
          `This is a key-restriction problem, NOT a code bug. The key likely has an HTTP-referrer ` +
          `restriction, which blocks server-side calls (they send no referer). Fix in Google Cloud ` +
          `Console → APIs & Services → Credentials: set the key's Application restriction to "None" ` +
          `(or use a separate server key), and ensure "Places API (New)" is enabled. Then re-run.`,
      )
      break
    }
    if (quotaHit) {
      console.error(
        `[ratings] Google Places daily quota exhausted (429) after ${rated} rated. ` +
          `Re-run this script after the quota resets to continue — already-rated rows are skipped.`,
      )
      break
    }
    if (info) {
      const patch = {}
      // Only (re)write a rating when the row lacks one, or on a full refresh.
      if (REFRESH_ALL || r.rating == null) {
        patch.rating = info.rating
        patch.review_count = info.reviewCount
      }
      // Resolve a displayable photo URL when the row lacks an image.
      if ((REFRESH_ALL || !r.image_url) && info.photoName) {
        const photoUri = await resolvePhotoUri(info.photoName, {
          apiKey: API_KEY,
          onStatus: (status) => {
            if (status === 429) quotaHit = true
            if (status === 401 || status === 403) authError = status
          },
        })
        if (photoUri) patch.image_url = photoUri
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("restaurants").update(patch).eq("id", r.id)
        if (error) console.warn(`[ratings] update failed for ${r.name}: ${error.message}`)
        else {
          if ("rating" in patch) rated++
          if ("image_url" in patch) imaged++
        }
      }
    } else {
      noMatch++
    }
    done++
    if (done % 50 === 0) {
      console.log(
        `[ratings] ${done}/${target.length} processed — ${rated} rated, ${imaged} imaged, ${noMatch} no match`,
      )
    }
    // Gentle pacing to stay within Places API quotas.
    await sleep(120)
  }

  console.log(`[ratings] DONE — ${rated} rated, ${imaged} imaged, ${noMatch} no match, ${done} total`)
}

main().catch((err) => {
  console.error("[ratings] Fatal:", err)
  process.exit(1)
})
