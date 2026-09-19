import Link from "next/link"
import { ArrowLeft, Upload, Search, MapPin, UtensilsCrossed, CalendarClock, LogOut, CloudDownload, FileSpreadsheet, Copy } from "lucide-react"
import { isAdmin } from "@/lib/admin-auth"
import { getSearchAnalytics } from "@/lib/analytics"
import { adminLogout } from "@/app/actions"
import { AdminLoginForm } from "@/components/admin-login-form"
import { AdminAnalytics } from "@/components/admin-analytics"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Admin dashboard | Explore Halal",
  description: "Search analytics and data management for Explore Halal.",
}

// Analytics must reflect live search logs on every visit.
export const dynamic = "force-dynamic"

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="font-heading text-xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return <AdminLoginForm />
  }

  const data = await getSearchAnalytics()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to finder
        </Link>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-balance">
              Search analytics
            </h1>
            <p className="text-muted-foreground text-pretty">
              What visitors are searching for across Explore Halal.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/upload">
                <Upload className="size-4" />
                Upload restaurants
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/import">
                <CloudDownload className="size-4" />
                Import from API
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/dedupe">
                <Copy className="size-4" />
                Remove duplicates
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/admin/export" download>
                <FileSpreadsheet className="size-4" />
                Download Excel
              </a>
            </Button>
            <form action={adminLogout}>
              <Button type="submit" variant="ghost">
                <LogOut className="size-4" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>

      {data.hasData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Search} label="Total searches" value={data.totalSearches.toLocaleString()} />
            <StatCard icon={CalendarClock} label="Last 7 days" value={data.last7Days.toLocaleString()} />
            <StatCard icon={MapPin} label="Areas searched" value={data.uniqueAreas.toLocaleString()} />
            <StatCard icon={UtensilsCrossed} label="Top cuisine" value={data.topCuisine} />
          </div>

          <AdminAnalytics data={data} />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Search className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium text-foreground">No searches logged yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Analytics will appear here once visitors start searching on the finder.
          </p>
        </div>
      )}
    </main>
  )
}
