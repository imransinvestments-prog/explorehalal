import Link from "next/link"
import { ArrowLeft, ShieldCheck, Users, Star, MapPin, Database } from "lucide-react"
import { SiteHeader } from "@/components/site-header"

export const metadata = {
  title: "Data sources — Explore Halal",
  description:
    "Where Explore Halal's listings, certifications, ratings, and photos come from, and what each source means.",
}

type Source = {
  icon: typeof ShieldCheck
  name: string
  tier: string
  body: string
}

const CERTIFICATION_SOURCES: Source[] = [
  {
    icon: ShieldCheck,
    name: "Halal Monitoring Committee (HMC)",
    tier: "Certified",
    body: "HMC operates a strict monitoring regime and only certifies premises that use hand-slaughtered, non-stunned meat with a continuous audit trail. Listings tagged HMC are drawn from HMC's own published register of certified outlets.",
  },
  {
    icon: ShieldCheck,
    name: "Halal Food Authority (HFA)",
    tier: "Certified",
    body: "HFA is one of the UK's largest halal certifiers and permits certain approved stunning methods. Listings tagged HFA come from HFA-certified premises data.",
  },
  {
    icon: Users,
    name: "Community & self-certified",
    tier: "Self-certified",
    body: "These venues describe themselves as halal but are not verified against an independent UK certifier. They come from open community datasets (see below). Always confirm the certification directly with the venue if this matters to you.",
  },
]

const DATA_SOURCES: Source[] = [
  {
    icon: Database,
    name: "HalalAPI",
    tier: "Community data",
    body: "A community-maintained directory of UK halal venues. Records are imported as self-certified unless they carry a recognised HMC or HFA certification.",
  },
  {
    icon: MapPin,
    name: "OpenStreetMap (via the Overpass API)",
    tier: "Community data",
    body: "OpenStreetMap is a free, open, crowd-sourced map of the world. We query venues tagged diet:halal=yes or diet:halal=only through the free Overpass API. These are contributor-submitted tags, not certifications, so they are stored as self-certified. Data © OpenStreetMap contributors, available under the Open Database License (ODbL).",
  },
  {
    icon: Star,
    name: "Google Places API",
    tier: "Ratings & photos",
    body: "We enrich listings with star ratings, review counts, and a venue photo from Google Places. This adds context to a listing but does not itself verify halal status. Ratings and images are © Google.",
  },
]

function SourceCard({ source }: { source: Source }) {
  const Icon = source.icon
  return (
    <li className="flex gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-heading text-base font-semibold text-foreground">{source.name}</h3>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {source.tier}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{source.body}</p>
      </div>
    </li>
  )
}

export default function SourcesPage() {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to restaurants
        </Link>

        <header className="mt-6">
          <h1 className="text-balance font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Where our data comes from
          </h1>
          <p className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground">
            Explore Halal combines independent UK certification registers with open community datasets, then enriches
            each listing with ratings and photos. Here is exactly what each source is and how much weight to give it.
          </p>
        </header>

        <section className="mt-10" aria-labelledby="certification-heading">
          <h2 id="certification-heading" className="font-heading text-lg font-semibold text-foreground">
            Certification types
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every listing is tagged with one of these so you can filter by how it was verified.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {CERTIFICATION_SOURCES.map((s) => (
              <SourceCard key={s.name} source={s} />
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="data-heading">
          <h2 id="data-heading" className="font-heading text-lg font-semibold text-foreground">
            Listing & enrichment sources
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The underlying feeds we pull venues and extra detail from.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {DATA_SOURCES.map((s) => (
              <SourceCard key={s.name} source={s} />
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-xl border border-border bg-card p-5">
          <h2 className="font-heading text-base font-semibold text-foreground">A note on accuracy</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Certification can change and community tags can be out of date. A listing on Explore Halal is a starting
            point, not a guarantee. For anything you consider important, confirm the current certification directly with
            the venue before you visit.
          </p>
        </section>
      </main>
    </div>
  )
}
