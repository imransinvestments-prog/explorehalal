const FALLBACK_SITE_URL = "https://explorehalal.vercel.app"

/**
 * Normalizes NEXT_PUBLIC_SITE_URL into a valid absolute URL.
 * The env var is sometimes set without a protocol (e.g. "www.explorehalal.co.uk"),
 * which crashes `new URL(...)`. This prepends https:// when missing and falls back
 * to a known-good URL if the value is unusable.
 */
export function getSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL
  if (!value) return FALLBACK_SITE_URL

  const trimmed = value.trim().replace(/\/+$/, "")
  if (!trimmed) return FALLBACK_SITE_URL

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    return new URL(withProtocol).toString().replace(/\/+$/, "")
  } catch {
    return FALLBACK_SITE_URL
  }
}
