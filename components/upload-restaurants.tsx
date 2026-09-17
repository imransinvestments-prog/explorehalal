"use client"

import { useRef, useState, useTransition } from "react"
import * as XLSX from "xlsx"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  uploadRestaurants,
  type UploadRow,
  type UploadSummary,
} from "@/app/actions"
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react"

/** Map many possible spreadsheet header spellings to our canonical field names. */
const HEADER_ALIASES: Record<string, keyof UploadRow> = {
  name: "name",
  "restaurant name": "name",
  "business name": "name",
  restaurant: "name",
  address: "address",
  "full address": "address",
  street: "address",
  postcode: "postcode",
  "post code": "postcode",
  zip: "postcode",
  cuisine: "cuisine_type",
  "cuisine type": "cuisine_type",
  cuisine_type: "cuisine_type",
  type: "cuisine_type",
  certification: "certification_body",
  "certification body": "certification_body",
  certification_body: "certification_body",
  body: "certification_body",
  status: "certification_status",
  "certification status": "certification_status",
  certification_status: "certification_status",
  source: "source",
}

function normalizeHeader(header: string): keyof UploadRow | null {
  const key = header.trim().toLowerCase()
  return HEADER_ALIASES[key] ?? null
}

function parseWorkbook(data: ArrayBuffer): UploadRow[] {
  const wb = XLSX.read(data, { type: "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })

  return raw.map((r) => {
    const row: UploadRow = {}
    for (const [header, value] of Object.entries(r)) {
      const field = normalizeHeader(header)
      if (field) row[field] = String(value ?? "").trim()
    }
    return row
  })
}

export function UploadRestaurants() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<UploadRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleFile(file: File) {
    setParseError(null)
    setSummary(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = parseWorkbook(e.target?.result as ArrayBuffer)
        const cleaned = parsed.filter((r) => r.name || r.postcode)
        if (cleaned.length === 0) {
          setParseError(
            "No usable rows found. Make sure your sheet has 'name' and 'postcode' columns.",
          )
          setRows([])
        } else {
          setRows(cleaned)
        }
      } catch {
        setParseError("Could not read that file. Please upload a valid .xlsx or .csv file.")
        setRows([])
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function reset() {
    setFileName(null)
    setRows([])
    setParseError(null)
    setSummary(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await uploadRestaurants(rows)
      setSummary(result)
    })
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "address", "postcode", "cuisine_type", "certification_body", "certification_status", "source"],
      ["Example Grill", "12 High Street, London", "E1 6AN", "Turkish", "HMC", "Certified", "Manual upload"],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "restaurants")
    XLSX.writeFile(wb, "restaurant-upload-template.xlsx")
  }

  const preview = rows.slice(0, 8)

  return (
    <div className="flex flex-col gap-6">
      {/* Dropzone / file picker */}
      <Card className="border-dashed p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Upload a spreadsheet</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Accepts .xlsx or .csv. Required columns: <span className="font-mono">name</span> and{" "}
              <span className="font-mono">postcode</span>. Optional: address, cuisine_type,
              certification_body (HMC/HFA/BOTH), certification_status, source.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => inputRef.current?.click()} className="gap-2">
              <FileSpreadsheet className="size-4" />
              Choose file
            </Button>
            <Button variant="outline" onClick={downloadTemplate} className="gap-2 bg-transparent">
              Download template
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          {fileName && (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
              <FileSpreadsheet className="size-4 text-muted-foreground" />
              <span className="font-medium">{fileName}</span>
              <button onClick={reset} aria-label="Remove file" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
      </Card>

      {parseError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !summary && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <p className="font-medium">Preview</p>
              <p className="text-sm text-muted-foreground">
                {rows.length} row{rows.length === 1 ? "" : "s"} ready to import
                {rows.length > preview.length && ` (showing first ${preview.length})`}
              </p>
            </div>
            <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
              {isPending ? "Importing…" : `Import ${rows.length} row${rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Address</th>
                  <th className="p-3 font-medium">Postcode</th>
                  <th className="p-3 font-medium">Cuisine</th>
                  <th className="p-3 font-medium">Cert.</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium text-foreground">{r.name || "—"}</td>
                    <td className="max-w-[220px] truncate p-3 text-muted-foreground">{r.address || "—"}</td>
                    <td className="p-3 font-mono text-xs">{r.postcode || "—"}</td>
                    <td className="p-3 text-muted-foreground">{r.cuisine_type || "—"}</td>
                    <td className="p-3">{r.certification_body || "HMC"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Result summary */}
      {summary && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="font-medium">Import complete</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-primary text-primary-foreground">{summary.inserted} inserted</Badge>
              <Badge variant="secondary">{summary.updated} updated</Badge>
              {summary.skipped > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  {summary.skipped} skipped
                </Badge>
              )}
            </div>
          </div>
          {summary.skipped > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-3 font-medium">Row</th>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Reason skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.results
                    .filter((r) => r.status === "skipped")
                    .map((r) => (
                      <tr key={r.row} className="border-b last:border-0">
                        <td className="p-3 font-mono text-xs">{r.row}</td>
                        <td className="p-3 font-medium">{r.name}</td>
                        <td className="p-3 text-muted-foreground">{r.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-4">
            <Button variant="outline" onClick={reset} className="gap-2 bg-transparent">
              Upload another file
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
