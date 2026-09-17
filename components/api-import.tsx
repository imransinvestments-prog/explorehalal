"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { importFromApi, type ApiImportSummary } from "@/app/actions"
import { CloudDownload, CheckCircle2, AlertTriangle } from "lucide-react"

const RADII = ["1", "2", "3", "5"]

export function ApiImport() {
  const [area, setArea] = useState("")
  const [radius, setRadius] = useState("2")
  const [summary, setSummary] = useState<ApiImportSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  function run() {
    if (!area.trim()) return
    setSummary(null)
    startTransition(async () => {
      const result = await importFromApi(area, Number(radius))
      setSummary(result)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CloudDownload className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Import from HalalAPI</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Pulls halal venues around an area from{" "}
              <span className="font-mono">halal-api.vercel.app</span>. These are community-sourced
              and imported as <span className="font-medium">Unverified</span> — existing HMC/HFA
              certified entries are never overwritten.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="area">Area</Label>
              <Input
                id="area"
                placeholder="e.g. E1 6AN or Manchester"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) run()
                }}
              />
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-32">
              <Label htmlFor="radius">Radius</Label>
              <Select value={radius} onValueChange={setRadius}>
                <SelectTrigger id="radius">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADII.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r} mile{r === "1" ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={isPending || !area.trim()} className="gap-2">
              <CloudDownload className="size-4" />
              {isPending ? "Importing…" : "Run import"}
            </Button>
          </div>
        </div>
      </Card>

      {summary?.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{summary.error}</span>
        </div>
      )}

      {summary && !summary.error && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="font-medium">
                Import complete for <span className="font-mono">{summary.area}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-primary text-primary-foreground">
                {summary.inserted} added
              </Badge>
              <Badge variant="secondary">{summary.skippedExisting} already present</Badge>
              {summary.skippedUngeocoded > 0 && (
                <Badge variant="outline">{summary.skippedUngeocoded} no location</Badge>
              )}
            </div>
          </div>
          <div className="p-4 text-sm text-muted-foreground">
            {summary.fetched === 0 ? (
              <p>No venues were returned for this area. Try a larger radius or a nearby postcode.</p>
            ) : (
              <p>
                Fetched {summary.fetched} venue{summary.fetched === 1 ? "" : "s"} from the API and
                added {summary.inserted} new community listing
                {summary.inserted === 1 ? "" : "s"}. Run another area to widen coverage.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
