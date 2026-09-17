"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import type { SearchAnalytics } from "@/lib/analytics"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
]

function formatDay(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function AdminAnalytics({ data }: { data: SearchAnalytics }) {
  const cuisineConfig: ChartConfig = {}
  data.cuisineKeys.forEach((key, i) => {
    cuisineConfig[key] = {
      label: key,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }
  })

  const areaConfig: ChartConfig = {
    count: { label: "Searches", color: "var(--chart-1)" },
  }

  return (
    <div className="grid gap-6">
      {/* Cuisines searched over time */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="font-heading text-base font-semibold text-foreground">
            Cuisines searched over time
          </h2>
          <p className="text-sm text-muted-foreground">
            Daily search volume, broken down by the cuisine filter applied.
          </p>
        </div>
        <ChartContainer config={cuisineConfig} className="aspect-auto h-[300px] w-full">
          <AreaChart data={data.cuisineOverTime} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              {data.cuisineKeys.map((key) => (
                <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.08} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={formatDay}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={28}
              allowDecimals={false}
            />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(v) => formatDay(String(v))} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            {data.cuisineKeys.map((key) => (
              <Area
                key={key}
                dataKey={key}
                type="monotone"
                stackId="cuisine"
                stroke={`var(--color-${key})`}
                fill={`url(#fill-${key})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </section>

      {/* Areas / postcodes searched */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="font-heading text-base font-semibold text-foreground">
            Top areas searched
          </h2>
          <p className="text-sm text-muted-foreground">
            Search volume by postcode area (outward code).
          </p>
        </div>
        {data.areas.length > 0 ? (
          <ChartContainer config={areaConfig} className="aspect-auto h-[360px] w-full">
            <BarChart
              data={data.areas}
              layout="vertical"
              margin={{ left: 8, right: 16 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="area"
                tickLine={false}
                axisLine={false}
                width={52}
                tickMargin={4}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No postcode searches recorded yet.
          </p>
        )}
      </section>
    </div>
  )
}
