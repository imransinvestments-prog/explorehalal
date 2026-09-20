"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Restaurant } from "@/lib/types"
import { BrandLogo } from "./brand-logo"
import { StatsBar } from "./stats-bar"

interface SplashScreenProps {
  restaurants: Restaurant[]
  onDismiss: () => void
}

export function SplashScreen({ restaurants, onDismiss }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Trigger the entrance transition on the next frame.
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  function dismiss() {
    if (leaving) return
    setLeaving(true)
    // Allow the exit transition to play before unmounting.
    window.setTimeout(onDismiss, 400)
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background px-4 transition-opacity duration-500",
        leaving ? "opacity-0" : "opacity-100",
      )}
      role="dialog"
      aria-label="Welcome to Explore Halal"
    >
      <div
        className={cn(
          "flex w-full max-w-3xl flex-col items-center transition-all duration-500 ease-out",
          mounted && !leaving ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <BrandLogo className="mb-6 h-16 w-auto object-contain sm:h-20" />
        <h1 className="text-balance text-center font-heading text-2xl font-bold text-foreground sm:text-4xl">
          UK Halal Restaurant Finder
        </h1>
        <p className="mt-3 max-w-md text-balance text-center text-sm text-muted-foreground sm:text-base">
          Discover HMC &amp; HFA certified halal restaurants and takeaways near you.
        </p>

        <div className="mt-8 w-full">
          <StatsBar restaurants={restaurants} />
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start searching
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
