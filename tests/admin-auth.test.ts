import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cookieJar = new Map<string, string>()
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  }),
}))

import {
  ADMIN_COOKIE,
  createSessionToken,
  isAdmin,
  verifyPassword,
  verifySessionToken,
} from "@/lib/admin-auth"

const SECRET = "s".repeat(32)
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "correct horse")
  vi.stubEnv("ADMIN_SESSION_SECRET", SECRET)
  cookieJar.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("session tokens", () => {
  it("accepts a freshly minted token", () => {
    const token = createSessionToken()!
    expect(verifySessionToken(token)).toBe(true)
  })

  it("rejects a token older than 8 hours", () => {
    const now = Date.now()
    const token = createSessionToken(now - 8 * HOUR - 1000)!
    expect(verifySessionToken(token, now)).toBe(false)
  })

  it("rejects a token issued in the future", () => {
    const now = Date.now()
    expect(verifySessionToken(createSessionToken(now + HOUR)!, now)).toBe(false)
  })

  it("rejects tampered and malformed tokens", () => {
    const token = createSessionToken()!
    const [issuedAt, sig] = token.split(".")
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0")
    expect(verifySessionToken(`${issuedAt}.${flipped}`)).toBe(false)
    expect(verifySessionToken(`${Number(issuedAt) + 1}.${sig}`)).toBe(false)
    expect(verifySessionToken(`${token}.extra`)).toBe(false)
    expect(verifySessionToken("not-a-token")).toBe(false)
    expect(verifySessionToken("")).toBe(false)
  })

  it("invalidates sessions when the secret is rotated", () => {
    const token = createSessionToken()!
    vi.stubEnv("ADMIN_SESSION_SECRET", "t".repeat(32))
    expect(verifySessionToken(token)).toBe(false)
  })

  it("invalidates sessions when the password changes", () => {
    const token = createSessionToken()!
    vi.stubEnv("ADMIN_PASSWORD", "new password")
    expect(verifySessionToken(token)).toBe(false)
  })
})

describe("fail closed when misconfigured", () => {
  it("refuses to mint or accept tokens without a password", () => {
    const token = createSessionToken()!
    vi.stubEnv("ADMIN_PASSWORD", "")
    expect(createSessionToken()).toBeNull()
    expect(verifySessionToken(token)).toBe(false)
  })

  it("refuses to mint or accept tokens with a missing or short secret", () => {
    const token = createSessionToken()!
    vi.stubEnv("ADMIN_SESSION_SECRET", "short")
    expect(createSessionToken()).toBeNull()
    expect(verifySessionToken(token)).toBe(false)
  })

  it("rejects the old forgeable empty-password cookie (regression)", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "")
    const legacy = createHash("sha256").update("explore-halal::admin::").digest("hex")
    cookieJar.set(ADMIN_COOKIE, legacy)
    expect(await isAdmin()).toBe(false)
  })

  it("never accepts an empty password", () => {
    vi.stubEnv("ADMIN_PASSWORD", "")
    expect(verifyPassword("")).toBe(false)
  })
})

describe("isAdmin", () => {
  it("is false with no cookie and true with a valid one", async () => {
    expect(await isAdmin()).toBe(false)
    cookieJar.set(ADMIN_COOKIE, createSessionToken()!)
    expect(await isAdmin()).toBe(true)
  })
})
