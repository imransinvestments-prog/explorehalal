"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  List,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Navigation,
  SlidersHorizontal,
  Star,
} from "lucide-react"
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
import { SplashScreen } from "./splash-screen"

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
    distance: 5,
  cuisine: "all",
}

type MobileView = "list" | "map"

// Build a compact page list with ellipses, e.g. 1 … 4 5 6 … 12
function getPageItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const items: (number | "ellipsis")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) items.push("ellipsis")
  for (let i = start; i <= end; i++) items.push(i)
  if (end < total - 1) items.push("ellipsis")
  items.push(total)
  return items
}

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
  const [pageSize, setPageSize] = useState<number | "all">(10)
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
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

  const perPage = pageSize === "all" ? restaurants.length || 1 : pageSize
  const pageCount = Math.max(1, Math.ceil(restaurants.length / perPage))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * perPage
  const pagedRestaurants = useMemo(
    () => restaurants.slice(pageStart, pageStart + perPage),
    [restaurants, pageStart, perPage],
  )

  // Reset to the first page whenever the result set or page size changes.
  useEffect(() => {
    setPage(1)
  }, [applied, origin, chips, sortBy, pageSize])

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
      {showSplash && (
        <SplashScreen restaurants={allRestaurants} onDismiss={() => setShowSplash(false)} />
      )}

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <BrandLogo className="h-12 w-auto shrink-0 object-contain sm:h-14" />
          <div>
            <h1 className="sr-only">Explore Halal</h1>
            <p className="font-heading text-sm font-semibold leading-tight text-amber-400">
              UK Halal Restaurant Finder
            </p>
          </div>
        </div>
      </header>

      <nav
        className="border-b border-border bg-card/60"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-1.5 sm:px-6">
          <Link
            href="/forum"
            aria-label="Forum"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            <span>Forum</span>
          </Link>
          <Link
            href="/sources"
            aria-label="Data sources"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
          >
            <HelpCircle className="size-4" aria-hidden="true" />
            <span>Sources</span>
          </Link>
          <Link
            href="/admin"
            aria-label="Admin"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
          >
            <Lock className="size-3.5" aria-hidden="true" />
            <span>Admin</span>
          </Link>
        </div>
      </nav>

      <section className="border-b border-border bg-card/70 lg:sticky lg:top-0 lg:z-40 lg:[backdrop-filter:blur(8px)]">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="search-filters-panel"
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-accent/10"
          >
            <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-foreground">
                {filtersOpen ? "Hide filters" : "Search & filters"}
              </span>
              {!filtersOpen && (
                <span className="truncate text-xs text-muted-foreground">
                  {[
                    locatedByGps
                      ? "Near my location"
                      : applied.postcode.trim()
                        ? applied.postcode.trim()
                        : "All areas",
                    `within ${applied.distance} ${applied.distance === 1 ? "mile" : "miles"}`,
                    applied.cuisine === "all" ? "all cuisines" : applied.cuisine,
                  ].join(" · ")}
                </span>
              )}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-muted-foreground">
              {filtersOpen ? "Collapse" : "Expand"}
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  filtersOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </span>
          </button>

          {filtersOpen && (
            <div id="search-filters-panel" className="pt-4">
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
          )}
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
            <label className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
              <span>Show</span>
              <select
                value={pageSize === "all" ? "all" : String(pageSize)}
                onChange={(e) =>
                  setPageSize(e.target.value === "all" ? "all" : Number(e.target.value))
                }
                aria-label="Number of restaurants per page"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium text-foreground"
              >
                {[10, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="all">All</option>
              </select>
            </label>

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
              restaurants={pagedRestaurants}
              activeId={activeId}
              onSelect={setActiveId}
              showDistance={showDistance}
              hasSearched={hasSearched}
            />

            {restaurants.length > 0 && pageCount > 1 && (
              <nav
                className="mt-6 flex items-center justify-between gap-3"
                aria-label="Restaurant list pagination"
              >
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Prev
                </button>

                <div className="flex items-center gap-1">
                  {getPageItems(currentPage, pageCount).map((item, i) =>
                    item === "ellipsis" ? (
                      <span
                        key={`gap-${i}`}
                        className="px-1.5 text-sm text-muted-foreground"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? "page" : undefined}
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                          item === currentPage
                            ? "bg-primary text-primary-foreground"
                            : "border border-border text-foreground hover:bg-accent/10",
                        )}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:pointer-events-none disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </nav>
            )}
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
