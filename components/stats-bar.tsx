import { BadgeCheck, MapPin, Store } from "lucide-react"
import type { Restaurant } from "@/lib/types"

interface StatsBarProps {
  restaurants: Restaurant[]
}

/** Round down to a clean "+" figure, e.g. 3542 -> "3,500+". */
function roundedPlus(n: number): string {
  if (n < 20) return String(n)
  const step = n >= 1000 ? 100 : 10
  const floored = Math.floor(n / step) * step
  return `${floored.toLocaleString("en-GB")}+`
}

/** Postcode areas double as UK town/city coverage (M = Manchester, B = Birmingham, …). */
function countCities(restaurants: Restaurant[]): number {
  const areas = new Set<string>()
  for (const r of restaurants) {
    const match = r.postcode?.trim().toUpperCase().match(/^[A-Z]{1,2}/)
    if (match) areas.add(match[0])
  }
  return areas.size
}

export function StatsBar({ restaurants }: StatsBarProps) {
  const total = restaurants.length
  const certified = restaurants.filter(
    (r) => r.certification_status === "Certified",
  ).length
  const cities = countCities(restaurants)

  const stats = [
    {
      icon: Store,
      value: roundedPlus(total),
      label: "Restaurants listed",
      sub: "Across our UK directory",
    },
    {
      icon: BadgeCheck,
      value: certified.toLocaleString("en-GB"),
      label: "Halal certified",
      sub: "HMC & HFA verified",
    },
    {
      icon: MapPin,
      value: roundedPlus(cities),
      label: "Areas covered",
      sub: "Towns & cities UK-wide",
    },
  ]

  return (
    <section aria-label="Directory coverage" className="mb-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {stats.map(({ icon: Icon, value, label, sub }) => (
          <div
            key={label}
            className="flex flex-col rounded-xl border border-border bg-card p-3 text-center sm:p-5"
          >
            <Icon
              className="mx-auto mb-2 size-4 text-primary sm:size-5"
              aria-hidden="true"
            />
            <span className="font-heading text-xl font-bold leading-none text-primary sm:text-3xl">
              {value}
            </span>
            <span className="mt-1.5 text-pretty text-xs font-semibold leading-tight text-foreground sm:text-sm">
              {label}
            </span>
            <span className="mt-0.5 hidden text-pretty text-xs leading-tight text-muted-foreground sm:block">
              {sub}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
