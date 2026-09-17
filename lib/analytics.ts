import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { groupCuisine } from "@/lib/cuisine-groups.mjs"

const NO_CUISINE_LABEL = "Any cuisine"
const MAX_CUISINE_SERIES = 6
const MAX_AREAS = 12

export interface CuisineSlice {
  cuisine: string
  count: number
}

export interface AreaSlice {
  area: string
  count: number
}

export interface TimeBucket {
  date: string
  [cuisine: string]: string | number
}

export interface SearchAnalytics {
  totalSearches: number
  last7Days: number
  uniqueAreas: number
  topCuisine: string
  cuisineKeys: string[]
  cuisineOverTime: TimeBucket[]
  topCuisines: CuisineSlice[]
  areas: AreaSlice[]
  hasData: boolean
}

interface RawLog {
  postcode: string | null
  cuisine_type: string | null
  created_at: string
}

/** Outward code = the part before the space, e.g. "E1 6AN" -> "E1". */
function outwardCode(postcode: string | null): string | null {
  if (!postcode) return null
  const trimmed = postcode.trim().toUpperCase()
  if (!trimmed) return null
  const space = trimmed.indexOf(" ")
  return space > 0 ? trimmed.slice(0, space) : trimmed
}

function dayKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD
}

const EMPTY: SearchAnalytics = {
  totalSearches: 0,
  last7Days: 0,
  uniqueAreas: 0,
  topCuisine: "—",
  cuisineKeys: [],
  cuisineOverTime: [],
  topCuisines: [],
  areas: [],
  hasData: false,
}

export async function getSearchAnalytics(): Promise<SearchAnalytics> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("search_logs")
    .select("postcode, cuisine_type, created_at")
    .order("created_at", { ascending: true })
    .limit(5000)

  if (error || !data || data.length === 0) {
    if (error) console.error("[v0] Failed to load search analytics:", error.message)
    return EMPTY
  }

  const logs = data as RawLog[]

  // --- Cuisine totals ------------------------------------------------------
  const cuisineCounts = new Map<string, number>()
  for (const log of logs) {
    const c = log.cuisine_type?.trim() ? groupCuisine(log.cuisine_type.trim()) : NO_CUISINE_LABEL
    cuisineCounts.set(c, (cuisineCounts.get(c) ?? 0) + 1)
  }
  const sortedCuisines = [...cuisineCounts.entries()].sort((a, b) => b[1] - a[1])
  const topCuisines: CuisineSlice[] = sortedCuisines.map(([cuisine, count]) => ({ cuisine, count }))

  // The named cuisine (ignoring the "Any cuisine" catch-all) that leads.
  const topNamed = sortedCuisines.find(([c]) => c !== NO_CUISINE_LABEL)
  const topCuisine = topNamed?.[0] ?? NO_CUISINE_LABEL

  // Series shown on the time chart: top N cuisines, rest folded into "Other".
  const seriesKeys = sortedCuisines.slice(0, MAX_CUISINE_SERIES).map(([c]) => c)
  const hasOther = sortedCuisines.length > MAX_CUISINE_SERIES
  const cuisineKeys = hasOther ? [...seriesKeys, "Other"] : seriesKeys
  const seriesSet = new Set(seriesKeys)

  // --- Cuisine over time (grouped by day) ----------------------------------
  const byDay = new Map<string, Map<string, number>>()
  for (const log of logs) {
    const day = dayKey(log.created_at)
    const rawCuisine = log.cuisine_type?.trim() ? groupCuisine(log.cuisine_type.trim()) : NO_CUISINE_LABEL
    const cuisine = seriesSet.has(rawCuisine) ? rawCuisine : "Other"
    if (!byDay.has(day)) byDay.set(day, new Map())
    const dayMap = byDay.get(day)!
    dayMap.set(cuisine, (dayMap.get(cuisine) ?? 0) + 1)
  }

  const cuisineOverTime: TimeBucket[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => {
      const bucket: TimeBucket = { date }
      for (const key of cuisineKeys) bucket[key] = counts.get(key) ?? 0
      return bucket
    })

  // --- Areas (outward code) ------------------------------------------------
  const areaCounts = new Map<string, number>()
  for (const log of logs) {
    const area = outwardCode(log.postcode)
    if (!area) continue
    areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1)
  }
  const areas: AreaSlice[] = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AREAS)
    .map(([area, count]) => ({ area, count }))

  // --- Summary stats -------------------------------------------------------
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const last7Days = logs.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length

  return {
    totalSearches: logs.length,
    last7Days,
    uniqueAreas: areaCounts.size,
    topCuisine,
    cuisineKeys,
    cuisineOverTime,
    topCuisines: topCuisines.slice(0, 8),
    areas,
    hasData: true,
  }
}
