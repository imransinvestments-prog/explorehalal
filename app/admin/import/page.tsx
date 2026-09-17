import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { isAdmin } from "@/lib/admin-auth"
import { AdminLoginForm } from "@/components/admin-login-form"
import { ApiImport } from "@/components/api-import"

export const metadata = {
  title: "Import from API | Explore Halal",
  description: "Import community halal venues from the HalalAPI.",
}

export const dynamic = "force-dynamic"

export default async function ImportPage() {
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
          <h1 className="text-2xl font-bold tracking-tight text-balance">Import from API</h1>
          <p className="text-muted-foreground text-pretty">
            Fetch halal venues around a chosen area from the HalalAPI. Imports run one area at a
            time so they finish quickly; repeat for other areas to widen coverage.
          </p>
        </div>
      </div>
      <ApiImport />
    </main>
  )
}
