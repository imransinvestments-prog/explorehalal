"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { HelpCircle, List, Lock, Map as MapIcon, MessageSquare, Navigation, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { filterRestaurants, restaurantCuisineGroup, type SortMode } from "@/lib/restaurants"
import { CUISINE_GROUP_ORDER } from "@/lib/cuisine-groups.mjs"
import { geocodeLocation, type Coordinates } from "@/lib/distance"
import { logSearch } from "@/app/actions"
import type { Restaurant } from "@/lib/types"
import { BrandLogo } from "./brand-logo"
import { SearchFilters, type Filters } from "./search-filters"
import { FilterChips, INITIAL_CHIPS, type ChipState } from "./filter-chips"
import { RestaurantList } from "./restaurant-list"
import { StatsBar } from "./stats-bar"

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
})

const INITIAL_FILTERS: Filters = {
  postcode: "",
  distance: 1,
  cuisine: "all",
}

type MobileView = "list" | "map"

interface HalalFinderProps {
  restaurants: Restaurant[]
}

export function HalalFinder({ restaurants: allRestaurants }: HalalFinderProps) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS)
  const [chips, setChips] = useState<ChipState>(INITIAL_CHIPS)
  const [sortBy, setSortBy] = useState<SortMode>("distance")
  const [origin, setOrigin] = useState<Coordinates | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>("list")
  const [locating, setLocating] = useState(false)
  const [locatedByGps, setLocatedByGps] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const autoLocated = useRef(false)

  const cuisineOptions = useMemo(() => {
    const present = new Set(allRestaurants.map((r) => restaurantCuisineGroup(r)))
    // Show groups in their canonical display order, only those present in data.
    return CUISINE_GROUP_ORDER.filter((g) => present.has(g))
  }, [allRestaurants])

  const { restaurants } = useMemo(
    () =>
      filterRestaurants(allRestaurants, {
        origin,
        maxDistanceMiles: applied.distance,
        cuisineType: applied.cuisine,
        certificationTypes: chips.certTypes,
        butchers: chips.butchers,
        sortBy,
      }),
    [allRestaurants, applied, origin, chips, sortBy],
  )

  const showDistance =
    Boolean(origin) && (applied.postcode.trim().length > 0 || locatedByGps)

  async function handleSearch() {
    setHasSearched(true)
    setActiveId(null)
    setSearching(true)
    setLocatedByGps(false)
    setLocationError(null)

    const searchOrigin = await geocodeLocation(filters.postcode)
    setOrigin(searchOrigin)
    setApplied(filters)
    setSearching(false)

    const { restaurants: matched } = filterRestaurants(allRestaurants, {
      origin: searchOrigin,
      maxDistanceMiles: filters.distance,
      cuisineType: filters.cuisine,
    })

    void logSearch({
      postcode: filters.postcode,
      distanceMiles: filters.distance,
      cuisineType: filters.cuisine,
      latitude: searchOrigin?.latitude ?? null,
      longitude: searchOrigin?.longitude ?? null,
      resultsCount: matched.length,
    })
  }

  function handleUseMyLocation() {
    setLocationError(null)
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError(
        "Location isn't available on this device — search by postcode instead.",
      )
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: Coordinates = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }
        setOrigin(coords)
        setApplied(filters)
        setLocatedByGps(true)
        setHasSearched(true)
        setActiveId(null)
        setLocating(false)

        const { restaurants: matched } = filterRestaurants(allRestaurants, {
          origin: coords,
          maxDistanceMiles: filters.distance,
          cuisineType: filters.cuisine,
        })
        void logSearch({
          postcode: "(my location)",
          distanceMiles: filters.distance,
          cuisineType: filters.cuisine,
          latitude: coords.latitude,
          longitude: coords.longitude,
          resultsCount: matched.length,
        })
      },
      (err) => {
        setLocating(false)
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — enable it in your browser, or search by postcode."
            : "Couldn't get your location — try searching by postcode.",
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  // On first load, try to search using the visitor's current location so
  // results are relevant immediately. Runs once; users can still search by
  // postcode if they deny permission.
  useEffect(() => {
    if (autoLocated.current) return
    autoLocated.current = true
    handleUseMyLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <BrandLogo className="h-12 w-auto shrink-0 object-contain sm:h-14" />
          <div>
            <h1 className="sr-only">Explore Halal</h1>
            <p className="font-heading text-sm font-semibold leading-tight text-amber-400">
              UK Halal Restaurant Finder
            </p>
            <p className="text-xs text-muted-foreground">
              HMC &amp; HFA certified restaurants near you
            </p>
          </div>
          <nav className="ml-auto flex items-center gap-1.5" aria-label="Primary">
            <Link
              href="/forum"
              aria-label="Forum"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
            >
              <MessageSquare className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Forum</span>
            </Link>
            <Link
              href="/sources"
              aria-label="Data sources"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
            >
              <HelpCircle className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sources</span>
            </Link>
            <Link
              href="/admin"
              aria-label="Admin"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
            >
              <Lock className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-card/70 lg:sticky lg:top-0 lg:z-40 lg:[backdrop-filter:blur(8px)]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <SearchFilters
            filters={filters}
            onChange={setFilters}
            onSearch={handleSearch}
            onUseMyLocation={handleUseMyLocation}
            locating={locating}
            locationError={locationError}
            cuisineOptions={cuisineOptions}
            searching={searching}
          />
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <FilterChips value={chips} onChange={setChips} />
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {restaurants.length}
            </span>{" "}
            {restaurants.length === 1 ? "restaurant" : "restaurants"}
            {showDistance && (
              <>
                {" "}
                within {applied.distance}{" "}
                {applied.distance === 1 ? "mile" : "miles"}
              </>
            )}
          </p>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-border p-0.5"
              role="group"
              aria-label="Sort restaurants"
            >
              {(
                [
                  { key: "distance", label: "Nearest", icon: Navigation },
                  { key: "rating", label: "Top rated", icon: Star },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortBy(key)}
                  aria-pressed={sortBy === key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    sortBy === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-lg border border-border p-0.5 lg:hidden">
              {(["list", "map"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMobileView(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    mobileView === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {v === "list" ? (
                    <List className="size-4" aria-hidden="true" />
                  ) : (
                    <MapIcon className="size-4" aria-hidden="true" />
                  )}
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className={cn(mobileView === "map" && "hidden lg:block")}>
            <RestaurantList
              restaurants={restaurants}
              activeId={activeId}
              onSelect={setActiveId}
              showDistance={showDistance}
              hasSearched={hasSearched}
            />
          </div>

          <div
            className={cn(
              "lg:sticky lg:top-6 lg:self-start",
              mobileView === "list" && "hidden lg:block",
            )}
          >
            <div className="h-[420px] overflow-hidden rounded-xl border border-border lg:h-[calc(100vh-8rem)]">
              <MapView
                origin={origin}
                restaurants={restaurants}
                activeId={activeId}
                onSelect={setActiveId}
              />
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-8">
          <StatsBar restaurants={allRestaurants} />
        </div>
      </main>
    </div>
  )
}
