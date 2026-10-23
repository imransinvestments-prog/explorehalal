import "server-only"
import { cookies } from "next/headers"
import { createHmac, timingSafeEqual } from "crypto"

export const ADMIN_COOKIE = "admin_session"
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 hours
const MIN_SECRET_LENGTH = 32

/**
 * HMAC key for session tokens. Mixes ADMIN_SESSION_SECRET with the admin
 * password, so rotating either one invalidates every existing session. Returns
 * null (fail closed: nobody is admin) when either is missing or the secret is
 * too short to be unguessable.
 */
function sessionKey(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET ?? ""
  const pw = process.env.ADMIN_PASSWORD ?? ""
  if (secret.length < MIN_SECRET_LENGTH || !pw) return null
  return `${secret}::${pw}`
}

function sign(issuedAt: string, key: string): string {
  return createHmac("sha256", key).update(`explore-halal::admin::${issuedAt}`).digest("hex")
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Mint a session token of the form `<issuedAtSeconds>.<hmac>`. The cookie holds
 * no secret material, can't be forged without the key, and expires server-side
 * after SESSION_MAX_AGE regardless of what the browser does with the cookie.
 * Returns null when the session key isn't configured.
 */
export function createSessionToken(now: number = Date.now()): string | null {
  const key = sessionKey()
  if (!key) return null
  const issuedAt = String(Math.floor(now / 1000))
  return `${issuedAt}.${sign(issuedAt, key)}`
}

/** True when `token` was signed with the current key and hasn't expired. */
export function verifySessionToken(token: string, now: number = Date.now()): boolean {
  const key = sessionKey()
  if (!key) return false

  const [issuedAt, signature, ...rest] = token.split(".")
  if (rest.length > 0 || !issuedAt || !signature || !/^\d+$/.test(issuedAt)) return false

  const ageSeconds = Math.floor(now / 1000) - Number(issuedAt)
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE) return false

  return safeEqual(signature, sign(issuedAt, key))
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
  return verifySessionToken(token)
}

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
}
