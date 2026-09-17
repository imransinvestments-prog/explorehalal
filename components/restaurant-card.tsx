"use client"

import { useState } from "react"
import { MapPin, UtensilsCrossed, Navigation, CalendarClock, BadgeInfo, ExternalLink, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RestaurantWithDistance } from "@/lib/types"
import { buildGoogleMapsUrl } from "@/lib/google-maps.mjs"
import { CertificationBadges, StatusBadge } from "./certification-badge"

/** Five stars with a gold fill layer clipped to the fractional rating. */
function StarRating({ rating }: { rating: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100))
  return (
    <span
      className="relative inline-flex shrink-0"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      <span className="flex text-muted-foreground/40">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="size-4 shrink-0" aria-hidden="true" />
        ))}
      </span>
      <span
        className="absolute inset-0 flex overflow-hidden text-amber-400"
        style={{ width: `${pct}%` }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="size-4 shrink-0 fill-current" aria-hidden="true" />
        ))}
      </span>
    </span>
  )
}

function formatDistance(miles: number): string {
  if (!Number.isFinite(miles)) return "—"
  return `${miles.toFixed(1)} mi`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function RestaurantCard({
  restaurant,
  active,
  onSelect,
  showDistance,
}: {
  restaurant: RestaurantWithDistance
  active?: boolean
  onSelect?: () => void
  showDistance: boolean
}) {
  const fullAddress =
    restaurant.postcode && !restaurant.address.includes(restaurant.postcode)
      ? `${restaurant.address}, ${restaurant.postcode}`
      : restaurant.address

  const mapsUrl =
    restaurant.google_maps_url ??
    buildGoogleMapsUrl({
      name: restaurant.name,
      address: restaurant.address,
      postcode: restaurant.postcode,
    })

  const [imageFailed, setImageFailed] = useState(false)
  const hasRealImage = Boolean(restaurant.image_url) && !imageFailed
  const imageSrc = hasRealImage
    ? (restaurant.image_url as string)
    : "/images/restaurant-fallback.jpg"

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onSelect?.()
        // Force Maps into a separate browsing context so the finder tab is
        // never navigated away from. Letting the anchor navigate can hand the
        // tab to the Maps app on mobile, leaving a broken page on "Back".
        if (typeof window !== "undefined") {
          e.preventDefault()
          const opened = window.open(mapsUrl, "_blank")
          if (opened) opened.opener = null
          else window.location.href = mapsUrl
        }
      }}
      className={cn(
        "group relative block overflow-hidden rounded-xl border bg-card transition-all",
        "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary ring-1 ring-primary/40 shadow-lg shadow-primary/10"
          : "border-border",
      )}
    >
      {/* Image header (Google Places photo, or watercolor fallback when none) */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        <img
          src={imageSrc || "/placeholder.svg"}
          alt={hasRealImage ? `Photo of ${restaurant.name}` : ""}
          aria-hidden={hasRealImage ? undefined : true}
          loading="lazy"
          onError={hasRealImage ? () => setImageFailed(true) : undefined}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {showDistance && (
          <span className="absolute right-2 top-2 inline-flex shrink-0 items-center gap-1 rounded-lg bg-background/85 px-2 py-1 text-xs font-bold text-primary backdrop-blur">
            <Navigation className="size-3" aria-hidden="true" />
            {formatDistance(restaurant.distanceMiles)}
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Tier 1: name (distance badge is overlaid on the image header above) */}
        <h3 className="font-heading text-lg font-bold leading-snug text-card-foreground text-pretty">
          {restaurant.name}
        </h3>

        {/* Tier 2a: cuisine — prominent, on its own row */}
        <div className="mt-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-sm font-bold text-accent-foreground shadow-sm">
            <UtensilsCrossed className="size-4" aria-hidden="true" />
            {restaurant.cuisine_type}
          </span>
        </div>

        {/* Tier 2a-ii: Google star rating */}
        {typeof restaurant.rating === "number" && restaurant.rating > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <StarRating rating={restaurant.rating} />
            <span className="text-sm font-bold text-card-foreground">
              {restaurant.rating.toFixed(1)}
            </span>
            {typeof restaurant.review_count === "number" && restaurant.review_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {`(${restaurant.review_count.toLocaleString("en-GB")} ${
                  restaurant.review_count === 1 ? "review" : "reviews"
                })`}
              </span>
            )}
          </div>
        )}

        {/* Tier 2b: certification + status chips */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <CertificationBadges body={restaurant.certification_body} />
          <StatusBadge status={restaurant.certification_status} />
        </div>

        {/* Tier 3: address */}
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
          <span className="line-clamp-2 leading-snug">{fullAddress}</span>
        </p>

        {/* Tier 4: discrete verification footer */}
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3" aria-hidden="true" />
            Last verified {formatDate(restaurant.last_scraped_date)}
          </p>
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Open in Maps
            <ExternalLink className="size-3" aria-hidden="true" />
          </span>
        </div>

        {restaurant.source && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground/70">
            <BadgeInfo className="mt-px size-3 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">Source: {restaurant.source}</span>
          </p>
        )}
      </div>
    </a>
  )
}
