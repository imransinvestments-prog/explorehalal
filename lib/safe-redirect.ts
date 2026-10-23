const PLACEHOLDER_ORIGIN = "http://explorehalal.invalid"

/**
 * Sanitise a user-supplied `next` redirect target so it can only point at a
 * path on this site. Anything else — absolute URLs, protocol-relative `//host`,
 * backslash tricks, `@host` userinfo when appended to an origin, control
 * characters — falls back to `fallback`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/forum"): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback

  // Belt and braces: resolving against a placeholder origin must not change it.
  try {
    const url = new URL(raw, PLACEHOLDER_ORIGIN)
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
