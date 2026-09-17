"use client"

import type { FormEvent } from "react"
import { LocateFixed, MapPin, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DISTANCE_OPTIONS } from "@/lib/types"

export interface Filters {
  postcode: string
  distance: number
  cuisine: string
}

export function SearchFilters({
  filters,
  onChange,
  onSearch,
  onUseMyLocation,
  locating = false,
  locationError = null,
  cuisineOptions,
  searching = false,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  onSearch: () => void
  onUseMyLocation: () => void
  locating?: boolean
  locationError?: string | null
  cuisineOptions: string[]
  searching?: boolean
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSearch()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end"
    >
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="postcode">Postcode or area</Label>
          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline disabled:opacity-60"
          >
            <LocateFixed className="size-3.5" aria-hidden="true" />
            {locating ? "Locating…" : "Use my location"}
          </button>
        </div>
        <div className="relative">
          <MapPin
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="postcode"
            placeholder="e.g. E1 6AN or Hounslow"
            autoComplete="off"
            value={filters.postcode}
            onChange={(e) =>
              onChange({ ...filters, postcode: e.target.value })
            }
            className="h-10 pl-9"
          />
        </div>
        {locationError && (
          <p className="text-xs text-destructive" role="alert">
            {locationError}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="distance">Distance</Label>
        <Select
          value={String(filters.distance)}
          onValueChange={(v) =>
            onChange({ ...filters, distance: Number(v) })
          }
        >
          <SelectTrigger id="distance" className="h-10 w-full">
            <SelectValue placeholder="Distance" />
          </SelectTrigger>
          <SelectContent>
            {DISTANCE_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                Within {d} {d === 1 ? "mile" : "miles"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="cuisine">Cuisine</Label>
        <Select
          value={filters.cuisine}
          onValueChange={(v) => onChange({ ...filters, cuisine: v })}
        >
          <SelectTrigger id="cuisine" className="h-10 w-full">
            <SelectValue placeholder="Any cuisine" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any cuisine</SelectItem>
            {cuisineOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={searching}
        className="h-10 gap-2 max-lg:w-full"
      >
        <Search className="size-4" aria-hidden="true" />
        {searching ? "Searching…" : "Search"}
      </Button>
    </form>
  )
}
