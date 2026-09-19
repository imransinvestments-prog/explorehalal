import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { isAdmin } from "@/lib/admin-auth"
import { AdminLoginForm } from "@/components/admin-login-form"
import { DedupeRestaurants } from "@/components/dedupe-restaurants"

export const metadata = {
  title: "Remove duplicates | Explore Halal",
  description: "Find and remove duplicate halal restaurants.",
}

export const dynamic = "force-dynamic"

export default async function DedupePage() {
  if (!(await isAdmin())) {
    return <AdminLoginForm />
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance">Remove duplicates</h1>
          <p className="text-muted-foreground text-pretty">
            Scan the database for restaurants that appear more than once. Duplicates are matched
            when they share the same postcode and their names contain two or more of the same words.
            Review each group before removing — the most complete record is always kept.
          </p>
        </div>
      </div>
      <DedupeRestaurants />
    </main>
  )
}
