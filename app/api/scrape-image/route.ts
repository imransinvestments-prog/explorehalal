import { NextResponse } from "next/server"
import * as cheerio from "cheerio"

// On-the-fly image scraper: given a restaurant's Google Maps share link
// (e.g. https://maps.app.goo.gl/…) or a full Maps URL, this follows redirects,
// loads the page HTML, and extracts the preview image from its Open Graph /
// Twitter meta tags. Returns { imageUrl } or { imageUrl: null } — it never
// throws so callers can treat a miss as "no image".
//
// GET /api/scrape-image?url=<encoded share link or maps url>

export const runtime = "nodejs"
// Result depends only on the target URL, so let the platform cache it.
export const revalidate = 86400 // 24h

/** Only allow scraping Google Maps / share-link hosts to prevent SSRF. */
const ALLOWED_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|google\.com|googleusercontent\.com)$/i

const BROWSER_HEADERS = {
  // A desktop UA makes Google return the meta-tag-rich HTML page.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-GB,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

function isAllowedUrl(raw: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
  if (!ALLOWED_HOST.test(parsed.hostname)) return null
  return parsed
}

/** Pull the best candidate image URL out of a Maps page's <head>. */
function extractImageUrl(html: string): string | null {
  const $ = cheerio.load(html)

  const metaCandidates = [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'meta[itemprop="image"]',
  ]
  for (const selector of metaCandidates) {
    const content = $(selector).attr("content")?.trim()
    if (content && /^https?:\/\//i.test(content)) return content
  }

  // Fallback: some Maps responses embed the thumbnail only in a link tag.
  const linkImage = $('link[rel="image_src"]').attr("href")?.trim()
  if (linkImage && /^https?:\/\//i.test(linkImage)) return linkImage

  // Last resort: scan inline scripts for a googleusercontent photo URL.
  const match = html.match(/https:\/\/[a-z0-9.]*googleusercontent\.com\/[^\s"'\\]+/i)
  if (match) return match[0]

  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get("url")?.trim()

  if (!target) {
    return NextResponse.json({ error: "Missing 'url' query parameter." }, { status: 400 })
  }

  const allowed = isAllowedUrl(target)
  if (!allowed) {
    return NextResponse.json(
      { error: "URL must be a Google Maps or share link." },
      { status: 400 },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(allowed.toString(), {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    })

    if (!res.ok) {
      return NextResponse.json(
        { imageUrl: null, error: `Upstream responded ${res.status}` },
        { status: 502 },
      )
    }

    const html = await res.text()
    const imageUrl = extractImageUrl(html)

    return NextResponse.json(
      { imageUrl, resolvedUrl: res.url },
      {
        headers: {
          // Mirror the route's revalidate window on the CDN edge.
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    )
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError"
    return NextResponse.json(
      { imageUrl: null, error: aborted ? "Timed out fetching the page." : "Failed to fetch the page." },
      { status: 502 },
    )
  } finally {
    clearTimeout(timer)
  }
}
