import "server-only"
import { cookies } from "next/headers"
import { createHash, timingSafeEqual } from "crypto"

export const ADMIN_COOKIE = "admin_session"
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 hours

/**
 * Derive an opaque session token from the admin password. The password itself
 * is never stored in the cookie — only this salted hash — so the cookie can't
 * be reversed into the password, and it changes if the password changes.
 */
export function sessionToken(): string {
  const pw = process.env.ADMIN_PASSWORD ?? ""
  return createHash("sha256").update(`explore-halal::admin::${pw}`).digest("hex")
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Constant-time comparison of a submitted password against ADMIN_PASSWORD. */
export function verifyPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD ?? ""
  if (!pw) return false
  return safeEqual(input, pw)
}

/** True when the current request carries a valid admin session cookie. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(ADMIN_COOKIE)?.value
  if (!token) return false
  return safeEqual(token, sessionToken())
}

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
}
