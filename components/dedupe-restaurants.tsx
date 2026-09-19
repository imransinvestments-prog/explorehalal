"use client"

import { useMemo, useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  previewDuplicates,
  deleteDuplicates,
  type DedupePreview,
  type DedupeEntry,
} from "@/app/actions"
import {
  Search,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Star,
} from "lucide-react"

function EntryMeta({ entry }: { entry: DedupeEntry }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium text-foreground">{entry.name}</p>
      <p className="truncate text-xs text-muted-foreground">{entry.address}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{entry.postcode}</span>
        <span aria-hidden>·</span>
        <span>{entry.certification_body}</span>
        {entry.rating != null && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-current text-amber-500" />
              {entry.rating.toFixed(1)}
              {entry.review_count != null && ` (${entry.review_count})`}
            </span>
          </>
        )}
        {entry.source && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{entry.source}</span>
          </>
        )}
      </div>
    </div>
  )
}

function KeepRow({ entry }: { entry: DedupeEntry }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        <ShieldCheck className="size-3" />
        Keep
      </span>
      <EntryMeta entry={entry} />
    </div>
  )
}

function RemoveRow({
  entry,
  checked,
  onToggle,
}: {
  entry: DedupeEntry
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 size-4 shrink-0 accent-destructive"
        aria-label={`Remove ${entry.name}`}
      />
      <span
        className={
          checked
            ? "mt-0.5 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive"
            : "mt-0.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        }
      >
        <Trash2 className="size-3" />
        {checked ? "Remove" : "Kept"}
      </span>
      <EntryMeta entry={entry} />
    </label>
  )
}

export function DedupeRestaurants() {
  const [preview, setPreview] = useState<DedupePreview | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletedCount, setDeletedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, startScan] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  function handleScan() {
    setError(null)
    setDeletedCount(null)
    setPreview(null)
    setSelectedIds(new Set())
    startScan(async () => {
      try {
        const result = await previewDuplicates()
        setPreview(result)
        // Every removable record starts selected for removal.
        setSelectedIds(new Set(result.clusters.flatMap((c) => c.remove.map((r) => r.id))))
      } catch {
        setError("Could not scan for duplicates. Please try again.")
      }
    })
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setClusterSelected(cluster: DedupePreview["clusters"][number], selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of cluster.remove) {
        if (selected) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  function handleDelete() {
    if (!preview) return
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setError(null)
    startDelete(async () => {
      const result = await deleteDuplicates(ids)
      if (result.error) {
        setError(result.error)
        return
      }
      setDeletedCount(result.deleted)
      setPreview(null)
      setSelectedIds(new Set())
    })
  }

  const selectedCount = selectedIds.size
  const matchedTotal = useMemo(
    () => (preview?.clusters.reduce((sum, c) => sum + c.remove.length, 0) ?? 0),
    [preview],
  )

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-dashed p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Search className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Scan for duplicate restaurants</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Groups venues that share the same address. For each group the most complete and
              trusted record is kept, and the rest are pre-selected for removal. Untick any record
              you want to keep, then confirm — nothing is deleted until you do.
            </p>
          </div>
          <Button onClick={handleScan} disabled={isScanning} className="gap-2">
            <Search className="size-4" />
            {isScanning ? "Scanning…" : "Scan for duplicates"}
          </Button>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {deletedCount != null && (
        <Card className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="font-medium text-foreground">
            Removed {deletedCount} duplicate{deletedCount === 1 ? "" : "s"}.
          </p>
        </Card>
      )}

      {preview && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{preview.totalRestaurants} total</Badge>
              <Badge variant="outline">
                {preview.clusters.length} duplicate group{preview.clusters.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline">{matchedTotal} matched</Badge>
              <Badge className="bg-destructive text-destructive-foreground">
                {selectedCount} selected
              </Badge>
            </div>
            {matchedTotal > 0 && (
              <Button
                onClick={handleDelete}
                disabled={isDeleting || selectedCount === 0}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="size-4" />
                {isDeleting
                  ? "Removing…"
                  : `Remove ${selectedCount} duplicate${selectedCount === 1 ? "" : "s"}`}
              </Button>
            )}
          </Card>

          {preview.clusters.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 size-8 text-primary" />
              <p className="font-medium text-foreground">No duplicates found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No two restaurants share the same address.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {preview.clusters.map((cluster) => {
                const selectedInCluster = cluster.remove.filter((r) =>
                  selectedIds.has(r.id),
                ).length
                const allSelected = selectedInCluster === cluster.remove.length
                return (
                  <Card key={cluster.keep.id} className="p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <span className="font-mono normal-case">{cluster.keep.postcode}</span>
                        <ArrowRight className="size-3" />
                        <span>
                          {cluster.remove.length + 1} at this address, keeping 1
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setClusterSelected(cluster, !allSelected)}
                      >
                        {allSelected ? "Not a duplicate" : "Select all to remove"}
                      </Button>
                    </div>
                    <div className="divide-y divide-border">
                      <KeepRow entry={cluster.keep} />
                      {cluster.remove.map((r) => (
                        <RemoveRow
                          key={r.id}
                          entry={r}
                          checked={selectedIds.has(r.id)}
                          onToggle={() => toggleId(r.id)}
                        />
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
