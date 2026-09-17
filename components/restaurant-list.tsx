"use client"

import { SearchX } from "lucide-react"
import type { RestaurantWithDistance } from "@/lib/types"
import { RestaurantCard } from "./restaurant-card"

export function RestaurantList({
  restaurants,
  activeId,
  onSelect,
  showDistance,
  hasSearched,
}: {
  restaurants: RestaurantWithDistance[]
  activeId: string | null
  onSelect: (id: string) => void
  showDistance: boolean
  hasSearched: boolean
}) {
  if (restaurants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">No restaurants found</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {hasSearched
              ? "Try widening your distance or clearing the cuisine filter."
              : "Enter a postcode above to find certified halal restaurants nearby."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {restaurants.map((r) => (
        <li key={r.id}>
          <RestaurantCard
            restaurant={r}
            active={activeId === r.id}
            onSelect={() => onSelect(r.id)}
            showDistance={showDistance}
          />
        </li>
      ))}
    </ul>
  )
}
