/**
 * Moves restaurant images from the legacy Supabase project's public storage
 * into this project's storage, then repoints `image_url` on `restaurants` and
 * `deleted_restaurants` at the new copies.
 *
 * Each file keeps its bucket and path (only the host changes) and is uploaded
 * with a Content-Type sniffed from its bytes (the legacy copies were served as
 * application/octet-stream).
 *
 * Dry run by default: checks every source file (first bytes only) and reports
 * what would happen, without creating buckets, uploading or updating rows.
 * The legacy files are never modified or deleted, so a rollback is a single
 * UPDATE swapping the host back.
 *
 * Run:
 *   node --env-file=.env.local scripts/migrate-storage-images.mjs            # dry run
 *   node --env-file=.env.local scripts/migrate-storage-images.mjs --apply
 *   node --env-file=.env.local scripts/migrate-storage-images.mjs --apply --limit=20
 *   node --env-file=.env.local scripts/migrate-storage-images.mjs --apply --concurrency=1
 *
 * Re-run until it reports 0 failures: each run only picks up rows still on the
 * legacy project. If uploads fail in bursts, lower --concurrency.
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL   (the destination project)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"

const LEGACY_ORIGIN = "https://molmcuxhcqubtpydpxuo.supabase.co"
const PUBLIC_PREFIX = "/storage/v1/object/public/"
const TABLES = ["restaurants", "deleted_restaurants"]
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_ATTEMPTS = 4
const REQUEST_TIMEOUT_MS = 60_000

/** fetch with a hard deadline, so a stalled connection fails (and is retried) instead of hanging. */
const timedFetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const limitArg = args.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))
const CONCURRENCY = Math.max(1, concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 4)

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[images] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}
if (SUPABASE_URL === LEGACY_ORIGIN) {
  console.error("[images] Destination is the legacy project itself; refusing to run.")
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const isTransient = (message) =>
  /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|aborted|\b50[234]\b/i.test(message)

/**
 * Retry a network step on transient failures with exponential backoff. `fn`
 * either resolves to `{ error }` (supabase-js style) or throws (fetch).
 */
async function withRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    let result
    try {
      result = await fn()
    } catch (err) {
      result = { error: { message: err instanceof Error ? `${err.message} ${err.cause?.code ?? ""}` : String(err) } }
    }
    if (!result.error) return result
    if (attempt >= MAX_ATTEMPTS || !isTransient(result.error.message)) return result
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

/** Identify an image from its leading bytes. Returns a MIME type or null. */
function sniffImageType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) return "image/webp"
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand === "avif" || brand === "avis") return "image/avif"
  }
  return null
}

/** Split a legacy public URL into { bucket, path }, or null if it isn't one. */
function parseLegacyUrl(url) {
  if (!url.startsWith(LEGACY_ORIGIN + PUBLIC_PREFIX)) return null
  const rest = url.slice((LEGACY_ORIGIN + PUBLIC_PREFIX).length)
  const slash = rest.indexOf("/")
  if (slash <= 0) return null
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) }
}

async function loadLegacyUrls(supabase) {
  const counts = new Map() // url -> number of rows referencing it
  for (const table of TABLES) {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select("image_url")
        .like("image_url", `${LEGACY_ORIGIN}%`)
        .order("image_url", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`${table}: ${error.message}`)
      for (const row of data) counts.set(row.image_url, (counts.get(row.image_url) ?? 0) + 1)
      if (data.length < PAGE) break
    }
  }
  return counts
}

async function ensureBucket(supabase, bucket) {
  const { data } = await supabase.storage.getBucket(bucket)
  if (data) {
    if (!data.public) throw new Error(`Bucket "${bucket}" exists but is not public.`)
    return
  }
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: MAX_FILE_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"],
  })
  if (error) throw new Error(`Create bucket "${bucket}": ${error.message}`)
  console.log(`[images] Created public bucket "${bucket}".`)
}

/** Check a source file from its first bytes only. */
async function probe(url) {
  const res = await timedFetch(url, { headers: { Range: "bytes=0-31" } })
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) return { ok: false, reason: "not a recognised image" }
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length") ?? 0)
  if (total > MAX_FILE_BYTES) return { ok: false, reason: `too large (${total} bytes)` }
  return { ok: true, type, bytes: total }
}

async function migrate(supabase, url, { bucket, path }) {
  const download = await withRetry(async () => {
    const res = await timedFetch(url)
    if (!res.ok) return { error: { message: `download HTTP ${res.status}` } }
    return { error: null, body: new Uint8Array(await res.arrayBuffer()) }
  })
  if (download.error) return { ok: false, reason: download.error.message }
  const body = download.body
  const type = sniffImageType(body)
  if (!type) return { ok: false, reason: "not a recognised image" }

  const { error: uploadError } = await withRetry(() =>
    supabase.storage.from(bucket).upload(path, body, {
      contentType: type,
      cacheControl: "31536000",
      upsert: true,
    }),
  )
  if (uploadError) return { ok: false, reason: `upload: ${uploadError.message}` }

  // Update rows only after the new copy exists, so a failure here leaves the
  // row on the (still working) legacy URL and a re-run retries it.
  const newUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  for (const table of TABLES) {
    const { error } = await withRetry(() =>
      supabase.from(table).update({ image_url: newUrl }).eq("image_url", url),
    )
    if (error) return { ok: false, reason: `update ${table}: ${error.message}` }
  }
  return { ok: true, type, bytes: body.length }
}

async function runPool(items, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch: timedFetch },
  })

  const counts = await loadLegacyUrls(supabase)
  const files = [...counts.keys()]
    .map((url) => ({ url, rows: counts.get(url), loc: parseLegacyUrl(url) }))
    .slice(0, LIMIT)
  const unparseable = files.filter((f) => !f.loc)
  const work = files.filter((f) => f.loc)
  const buckets = [...new Set(work.map((f) => f.loc.bucket))]

  console.log(`[images] ${APPLY ? "APPLY" : "DRY RUN"}: ${SUPABASE_URL}`)
  console.log(
    `[images] ${work.length} files referenced by ${work.reduce((n, f) => n + f.rows, 0)} rows; buckets: ${buckets.join(", ")}`,
  )
  if (unparseable.length) console.log(`[images] ${unparseable.length} URLs not in public-object form (skipped).`)

  if (APPLY) for (const bucket of buckets) await ensureBucket(supabase, bucket)

  const byType = new Map()
  const failures = []
  let done = 0
  let bytes = 0

  await runPool(work, async (file) => {
    let result
    try {
      result = APPLY ? await migrate(supabase, file.url, file.loc) : await probe(file.url)
    } catch (err) {
      result = { ok: false, reason: err instanceof Error ? err.message : String(err) }
    }
    if (result.ok) {
      byType.set(result.type, (byType.get(result.type) ?? 0) + 1)
      bytes += result.bytes
    } else {
      failures.push({ url: file.url, reason: result.reason })
    }
    done++
    if (done % 100 === 0) console.log(`[images] ${done}/${work.length}`)
  })

  console.log(`[images] ${APPLY ? "Migrated" : "Would migrate"} ${work.length - failures.length}/${work.length} files`)
  console.log(`[images] Types: ${[...byType].map(([t, n]) => `${t} ${n}`).join(", ") || "none"}`)
  console.log(`[images] Total size: ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  if (failures.length) {
    console.log(`[images] ${failures.length} failures (rows left pointing at the legacy copy):`)
    for (const f of failures.slice(0, 20)) console.log(`  - ${f.reason}: ${f.url}`)
    if (failures.length > 20) console.log(`  … and ${failures.length - 20} more`)
  }
  if (!APPLY) console.log("[images] Dry run only. Re-run with --apply to perform the migration.")
}

main().catch((err) => {
  console.error("[images] Fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
