import { describe, expect, it } from "vitest"
import { safeNextPath } from "@/lib/safe-redirect"

describe("safeNextPath", () => {
  it.each([
    ["@evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    ["/\tevil"],
    [""],
    [null],
    [undefined],
  ])("rejects %j", (raw) => {
    expect(safeNextPath(raw)).toBe("/forum")
  })

  it.each([
    ["/forum/abc?x=1", "/forum/abc?x=1"],
    ["/forum/new", "/forum/new"],
    ["/@evil.com", "/@evil.com"], // a path on this site, not a host
  ])("keeps same-site path %j", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })

  it("uses the supplied fallback", () => {
    expect(safeNextPath("//evil.com", "/")).toBe("/")
  })
})
