import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { HalalFinder } from "@/components/halal-finder"
import { fetchRestaurants } from "@/lib/restaurants-server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Find Halal Restaurants & Takeaways Near You",
  description:
    "Search HMC and HFA certified halal restaurants, takeaways, and eateries by location, distance, and cuisine. Discover halal burgers, grills, curry, kebabs, fried chicken, pizza, and desserts near you on an interactive map.",
  alternates: { canonical: "/" },
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams

  // Supabase may deliver the magic-link code to the site root when the
  // redirect target isn't allow-listed. Exchange it here so auth still
  // completes, then forward to the forum.
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    redirect(error ? "/auth/error" : "/forum")
  }

  const restaurants = await fetchRestaurants()
  return <HalalFinder restaurants={restaurants} />
}
