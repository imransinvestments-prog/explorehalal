/**
 * Scrapes UK halal restaurant listings from the official certification
 * directories and upserts them into the Supabase `restaurants` table.
 *
 * ---------------------------------------------------------------------------
 * REALITY OF THE TWO SOURCES (verified against the live sites)
 * ---------------------------------------------------------------------------
 * HMC — Halal Monitoring Committee  (https://halalhmc.org/outlets/)
 *   - Publishes a searchable directory of certified outlets.
 *   - There is NO "list everything" page: you must search by a location (or
 *     name) with a distance radius, and results are loaded via AJAX after
 *     clicking the "Search" button (button.filter-search).
 *   - This scraper therefore sweeps a seed list of UK cities at a 100-mile
 *     radius and de-duplicates the combined results.
 *   - IMPORTANT: the page runs an *invisible Google reCAPTCHA*. That exists
 *     specifically to deter automated access, so a headless sweep may be
 *     throttled or return no rows. If that happens the script logs a clear
 *     warning rather than failing silently. Run with --debug to see counts.
 *
 * HFA — Halal Food Authority  (https://halalfoodauthority.com)
 *   - Does NOT publish a public, searchable directory of certified premises.
 *     Certification is verified via on-site signage / product packaging only.
 *   - There is therefore nothing to scrape. The HFA source is included but
 *     disabled by default; enable it with --hfa once/if they publish a
 *     directory, and fill in the selectors in the SOURCES config.
 *
 * ---------------------------------------------------------------------------
 * Run:
 *   node scripts/scrape-halal-directories.mjs                 # scrape HMC + upsert
 *   node scripts/scrape-halal-directories.mjs --dry-run       # scrape only, no DB writes
 *   node scripts/scrape-halal-directories.mjs --debug         # verbose, dump samples
 *   node scripts/scrape-halal-directories.mjs --limit=50      # cap rows per source
 *   node scripts/scrape-halal-directories.mjs --cities=London,Birmingham
 *   node scripts/scrape-halal-directories.mjs --no-geocode    # skip postcodes.io lookups
 *
 * Env (already present in this project):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import puppeteer from "puppeteer"
import { createClient } from "@supabase/supabase-js"
import { resolveCuisine } from "../lib/cuisine-groups.mjs"

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const DEBUG = args.includes("--debug")
const ENABLE_HFA = args.includes("--hfa")
const NO_GEOCODE = args.includes("--no-geocode")
const LIMIT = numFlag("--limit=", Number.POSITIVE_INFINITY)
const CITIES = (() => {
  const flag = args.find((a) => a.startsWith("--cities="))
  if (flag) return flag.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean)
  return [
    "London", "Birmingham", "Manchester", "Leicester", "Bradford",
    "Leeds", "Luton", "Blackburn", "Glasgow", "Sheffield", "Nottingham",
  ]
})()

function numFlag(prefix, fallback) {
  const flag = args.find((a) => a.startsWith(prefix))
  const n = flag ? Number.parseInt(flag.split("=")[1], 10) : NaN
  return Number.isFinite(n) ? n : fallback
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error(
    "[scrape] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them or run with --dry-run.",
  )
  process.exit(1)
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------
const HMC = {
  body: "HMC",
  url: "https://halalhmc.org/outlets/",
  // Real control selectors, verified against the live page:
  selectors: {
    query: 'input[name="q"]',
    type: 'select[name="type"]',       // categories incl. "Restaurants and Takeaways"
    distance: 'select[name="distance"]', // 5,10,15,20,50,100 (miles)
    searchButton: "button.filter-search",
  },
  // The category label to select (matched case-insensitively by option text).
  categoryLabel: "Restaurants and Takeaways",
  distanceMiles: "100",
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const clean = (t) => (t ?? "").replace(/\s+/g, " ").trim()

// Coarse, filterable certification tier stored alongside certification_body.
// A "BOTH" premises is classed as HMC; anything non-certified is "Other".
function certTypeFromBody(body) {
  if (body === "HMC" || body === "BOTH") return "HMC"
  if (body === "HFA") return "HFA"
  return "Other"
}
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

function extractPostcode(text) {
  const m = clean(text).match(UK_POSTCODE_RE)
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null
}

// Map the HMC category-icon slug (from the card image filename) to a
// human-readable cuisine/type used by the app's cuisine filter.
function categoryToCuisine(slug) {
  const map = {
    "restaurants-and-takeaways": "Restaurant/Takeaway",
    "dessert-shops": "Dessert",
    butchers: "Butcher",
    caterers: "Caterer",
    other: "Other",
  }
  return map[slug] ?? "Restaurant/Takeaway"
}

// HMC addresses come with the postcode appended (e.g. "…London, W1D 6LH").
// The table stores postcode separately and the UI renders it separately, so
// strip the trailing postcode to avoid a duplicated "…, W1D 6LH, W1D 6LH".
function stripTrailingPostcode(address, postcode) {
  if (!address || !postcode) return address
  const re = new RegExp(",?\\s*" + postcode.replace(/\s+/g, "\\s*") + "\\s*$", "i")
  return clean(address.replace(re, "")).replace(/[,\s]+$/, "")
}

function normalizeStatus(raw) {
  const s = clean(raw).toLowerCase()
  if (!s) return "Certified"
  if (s.includes("suspend")) return "Suspended"
  if (s.includes("expire") || s.includes("lapsed")) return "Expired"
  if (s.includes("pending") || s.includes("progress") || s.includes("review")) return "Pending"
  return "Certified"
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// HMC scrape — drive the real search form, one city at a time.
// ---------------------------------------------------------------------------
async function scrapeHMC(browser) {
  const results = []
  const seen = new Set()

  for (const city of CITIES) {
    const page = await browser.newPage()
    await page.setUserAgent(USER_AGENT)
    try {
      await page.goto(HMC.url, { waitUntil: "networkidle2", timeout: 60_000 })

      // Fill the location box.
      await page.waitForSelector(HMC.selectors.query, { timeout: 15_000 })
      await page.$eval(HMC.selectors.query, (el, value) => {
        el.value = value
        el.dispatchEvent(new Event("input", { bubbles: true }))
      }, city)

      // Choose the "Restaurants and Takeaways" category (by visible text).
      await page.$eval(
        HMC.selectors.type,
        (sel, label) => {
          const opt = [...sel.options].find((o) =>
            o.text.trim().toLowerCase().includes(label.toLowerCase()),
          )
          if (opt) {
            sel.value = opt.value
            sel.dispatchEvent(new Event("change", { bubbles: true }))
          }
        },
        HMC.categoryLabel,
      ).catch(() => {})

      // Widen the radius as far as the form allows.
      await page.$eval(
        HMC.selectors.distance,
        (sel, miles) => {
          const opt = [...sel.options].find((o) => o.value === miles) ?? sel.options[sel.options.length - 1]
          if (opt) {
            sel.value = opt.value
            sel.dispatchEvent(new Event("change", { bubbles: true }))
          }
        },
        HMC.distanceMiles,
      ).catch(() => {})

      // Submit and give the AJAX + (invisible) reCAPTCHA time to resolve.
      await page.click(HMC.selectors.searchButton).catch(() => {})
      await sleep(6_000)

      // Parse result cards. Verified live structure of each result:
      //   div.outlet-content
      //     div.outlet-title > a > h3            -> name
      //       img[src=".../cat-<category>.png"]  -> category (cuisine)
      //     p.outlet-address                     -> address (+ nested a.outlet-tel phone to strip)
      //     a "View Certificate"                 -> certificate link (proves active cert)
      const rows = await page.evaluate(() => {
        return [...document.querySelectorAll("div.outlet-content")].map((card) => {
          const name = card.querySelector(".outlet-title h3, .outlet-title a")?.innerText ?? ""

          // Address text without the phone-number anchor.
          const addrEl = card.querySelector("p.outlet-address")
          let address = ""
          if (addrEl) {
            const clone = addrEl.cloneNode(true)
            clone.querySelectorAll("a").forEach((a) => a.remove())
            address = clone.textContent ?? ""
          }

          // Category is encoded in the icon filename, e.g. cat-restaurants-and-takeaways.png
          const icon = card.querySelector(".outlet-title img")?.getAttribute("src") ?? ""
          const catMatch = icon.match(/cat-([a-z-]+)\.png/i)
          const category = catMatch ? catMatch[1] : ""

          const hasCertLink = /view certificate/i.test(card.innerText)
          return { name, address, category, hasCertLink }
        })
      })

      let added = 0
      for (const r of rows) {
        const name = clean(r.name)
        const postcode = extractPostcode(r.address)
        if (!name || !postcode) continue
        const key = `${name.toLowerCase()}|${postcode.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        results.push({
          name,
          address: stripTrailingPostcode(clean(r.address), postcode) || postcode,
          postcode,
          cuisine_type: categoryToCuisine(r.category),
          certification_body: "HMC",
          // The public directory only lists currently-certified premises
          // (each card carries a "View Certificate" link); suspended/expired
          // premises are removed, so every listed outlet is Certified.
          certification_status: "Certified",
        })
        added++
        if (results.length >= LIMIT) break
      }

      console.log(`[scrape] HMC "${city}": ${rows.length} card(s) seen, ${added} new usable`)
      if (DEBUG && rows[0]) console.log("[scrape] HMC sample:", rows[0])
      if (rows.length === 0) {
        console.warn(
          `[scrape] HMC "${city}": no cards parsed — likely blocked by the site's ` +
            "invisible reCAPTCHA or the results markup changed. Re-run with --debug.",
        )
      }
    } catch (err) {
      console.warn(`[scrape] HMC "${city}": ${err.message}`)
    } finally {
      await page.close()
      if (results.length >= LIMIT) break
      await sleep(1_500) // be polite between requests
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// HFA — no public directory exists (see header note).
// ---------------------------------------------------------------------------
async function scrapeHFA(_browser) {
  if (!ENABLE_HFA) {
    console.log(
      "[scrape] HFA: skipped — the Halal Food Authority does not publish a public " +
        "searchable directory, so there is nothing to scrape. Pass --hfa to force an attempt.",
    )
    return []
  }
  console.warn(
    "[scrape] HFA: --hfa was set, but no public directory URL/selectors are configured. " +
      "Add them to the SOURCES config once HFA exposes a directory.",
  )
  return []
}

// ---------------------------------------------------------------------------
// Geocoding via postcodes.io (free, no auth, UK only). The table's
// latitude/longitude are NOT NULL, and the app's map + Haversine distance
// filter need real coordinates.
// ---------------------------------------------------------------------------
async function geocode(postcodes) {
  const coords = new Map()
  if (NO_GEOCODE || postcodes.length === 0) return coords

  // postcodes.io bulk endpoint accepts up to 100 postcodes per call.
  for (let i = 0; i < postcodes.length; i += 100) {
    const batch = postcodes.slice(i, i + 100)
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: batch }),
      })
      const json = await res.json()
      for (const entry of json.result ?? []) {
        if (entry.result) {
          coords.set(entry.query.toUpperCase(), {
            lat: entry.result.latitude,
            lng: entry.result.longitude,
          })
        }
      }
    } catch (err) {
      console.warn(`[scrape] geocode batch failed: ${err.message}`)
    }
    await sleep(300)
  }
  console.log(`[scrape] geocoded ${coords.size}/${postcodes.length} postcode(s)`)
  return coords
}

// ---------------------------------------------------------------------------
// Merge premises that appear in BOTH directories into a single "BOTH" row.
// ---------------------------------------------------------------------------
function mergeByPremises(records) {
  const map = new Map()
  const rank = { Certified: 3, Pending: 2, Expired: 1, Suspended: 0 }
  for (const rec of records) {
    const key = `${rec.name.toLowerCase()}|${(rec.postcode ?? rec.address).toLowerCase()}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...rec })
      continue
    }
    if (existing.certification_body !== rec.certification_body) existing.certification_body = "BOTH"
    if (rank[rec.certification_status] > rank[existing.certification_status]) {
      existing.certification_status = rec.certification_status
    }
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------
// Upsert into Supabase (dedupe on name+postcode; insert vs update per row).
// ---------------------------------------------------------------------------
async function saveToSupabase(records, coords) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: existing, error: readErr } = await supabase
    .from("restaurants")
    .select("id, name, postcode")
  if (readErr) {
    console.error("[scrape] Failed to read existing rows:", readErr.message)
    return
  }

  const existingByKey = new Map(
    (existing ?? []).map((r) => [`${r.name.toLowerCase()}|${(r.postcode ?? "").toLowerCase()}`, r.id]),
  )

  const today = new Date().toISOString().slice(0, 10)
  let inserted = 0
  let updated = 0

  for (const rec of records) {
    const key = `${rec.name.toLowerCase()}|${(rec.postcode ?? "").toLowerCase()}`
    const id = existingByKey.get(key)
    const coord = rec.postcode ? coords.get(rec.postcode.toUpperCase()) : null
    const { cuisineType, cuisineGroup } = resolveCuisine({ name: rec.name, cuisineType: rec.cuisine_type })
    const base = {
      name: rec.name,
      address: rec.address,
      postcode: rec.postcode ?? "",
      cuisine_type: cuisineType,
      cuisine_group: cuisineGroup,
      certification_body: rec.certification_body,
      certification_type: certTypeFromBody(rec.certification_body),
      certification_status: rec.certification_status,
      last_scraped_date: today,
    }

    if (id) {
      // Only overwrite coordinates when we actually resolved them.
      const payload = coord ? { ...base, latitude: coord.lat, longitude: coord.lng } : base
      const { error } = await supabase.from("restaurants").update(payload).eq("id", id)
      if (error) console.warn(`[scrape] update failed for "${rec.name}": ${error.message}`)
      else updated++
    } else {
      const { error } = await supabase.from("restaurants").insert({
        ...base,
        latitude: coord?.lat ?? 0,
        longitude: coord?.lng ?? 0,
      })
      if (error) console.warn(`[scrape] insert failed for "${rec.name}": ${error.message}`)
      else inserted++
    }
  }

  console.log(`[scrape] Supabase: ${inserted} inserted, ${updated} updated`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(
    `[scrape] starting${DRY_RUN ? " (dry-run)" : ""} — cities: ${CITIES.join(", ")}`,
  )
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    const all = []
    all.push(...(await scrapeHMC(browser)))
    all.push(...(await scrapeHFA(browser)))

    const merged = mergeByPremises(all)
    console.log(`[scrape] ${all.length} scraped, ${merged.length} after merge`)

    if (merged.length === 0) {
      console.log(
        "[scrape] Nothing to save. The HMC directory is protected by an invisible " +
          "reCAPTCHA and HFA has no public directory — see the notes at the top of this file.",
      )
      return
    }

    const coords = await geocode([...new Set(merged.map((r) => r.postcode).filter(Boolean))])

    if (DRY_RUN) {
      console.log("[scrape] --dry-run: results (no DB writes):")
      console.dir(
        merged.map((r) => ({ ...r, coords: coords.get((r.postcode ?? "").toUpperCase()) ?? null })),
        { depth: null },
      )
    } else {
      await saveToSupabase(merged, coords)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("[scrape] Fatal:", err)
  process.exit(1)
})
