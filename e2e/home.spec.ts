import { expect, test, type Page } from "@playwright/test"

// Matches SPLASH_SEEN_KEY in components/splash-screen.tsx.
const SPLASH_SEEN_KEY = "explorehalal:splash-seen"

const results = (page: Page) => page.getByRole("region", { name: "Results" }).getByRole("listitem")

/** Collect uncaught page errors so each test can assert there were none. */
function trackPageErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))
  return errors
}

async function skipSplash(page: Page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, "1"), SPLASH_SEEN_KEY)
}

test("first visit shows the splash, then the restaurant list", async ({ page }) => {
  const errors = trackPageErrors(page)
  await page.goto("/")

  const splash = page.getByRole("dialog", { name: "UK Halal Restaurant Finder" })
  await expect(splash).toBeVisible()
  await expect(splash.getByRole("region", { name: "Directory coverage" })).toBeVisible()

  await splash.getByRole("button", { name: "Start searching" }).click()
  await expect(splash).toBeHidden()
  await expect(results(page).first()).toBeVisible()
  expect(errors).toEqual([])
})

test("returning visitors skip the splash", async ({ page }) => {
  await skipSplash(page)
  await page.goto("/")

  await expect(results(page).first()).toBeVisible()
  await expect(page.getByRole("dialog", { name: "UK Halal Restaurant Finder" })).toHaveCount(0)
})

// Issue #21: Google Places image URLs expire, and onError misses failures that
// happen before hydration, so a card can be left showing a broken image.
// Fails reliably in CI (fast network: images fail before hydration). Remove .fixme with the fix.
test.fixme("every card image loads or shows the fallback", async ({ page }) => {
  await skipSplash(page)
  await page.goto("/")
  await expect(results(page).first()).toBeVisible()

  const images = results(page).locator("img")
  const broken: string[] = []
  for (let i = 0; i < (await images.count()); i++) {
    const img = images.nth(i)
    await img.scrollIntoViewIfNeeded() // images are loading="lazy"
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete)).toBe(true)
    const { ok, src } = await img.evaluate((el: HTMLImageElement) => ({
      ok: el.naturalWidth > 0,
      src: el.currentSrc || el.src,
    }))
    if (!ok) broken.push(src)
  }
  expect(broken).toEqual([])
})
