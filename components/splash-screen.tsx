"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Restaurant } from "@/lib/types"
import { BrandLogo } from "./brand-logo"
import { StatsBar } from "./stats-bar"

/** localStorage flag set once a visitor has dismissed the welcome splash. */
export const SPLASH_SEEN_KEY = "explorehalal:splash-seen"

interface SplashScreenProps {
  restaurants: Restaurant[]
  onDismiss: () => void
}

export function SplashScreen({ restaurants, onDismiss }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    // Trigger the entrance transition on the next frame.
    const id = requestAnimationFrame(() => setMounted(true))
    // The rest of the page is inert while the splash is open, so focus the
    // only action straight away.
    buttonRef.current?.focus()
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  function dismiss() {
    if (leaving) return
    setLeaving(true)
    // Allow the exit transition to play before unmounting.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    window.setTimeout(onDismiss, reduced ? 0 : 400)
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-background px-4 py-8 transition-opacity duration-500 motion-reduce:transition-none",
        leaving ? "opacity-0" : "opacity-100",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="splash-title"
      aria-describedby="splash-description"
    >
      <div
        className={cn(
          "flex w-full max-w-3xl flex-col items-center transition-all duration-500 ease-out motion-reduce:transition-none",
          mounted && !leaving ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <BrandLogo className="mb-6 h-16 w-auto object-contain sm:h-20" />
        <h2
          id="splash-title"
          className="text-balance text-center font-heading text-2xl font-bold text-foreground sm:text-4xl"
        >
          UK Halal Restaurant Finder
        </h2>
        <p
          id="splash-description"
          className="mt-3 max-w-md text-balance text-center text-sm text-muted-foreground sm:text-base"
        >
          Discover HMC &amp; HFA certified halal restaurants and takeaways near you.
        </p>

        <div className="mt-8 w-full">
          <StatsBar restaurants={restaurants} />
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={dismiss}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Start searching
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
