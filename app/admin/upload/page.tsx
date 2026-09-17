import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { isAdmin } from "@/lib/admin-auth"
import { AdminLoginForm } from "@/components/admin-login-form"
import { UploadRestaurants } from "@/components/upload-restaurants"

export const metadata = {
  title: "Upload restaurants | Explore Halal",
  description: "Bulk import halal restaurants from a spreadsheet.",
}

export const dynamic = "force-dynamic"

export default async function UploadPage() {
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
          <h1 className="text-2xl font-bold tracking-tight text-balance">Upload restaurants</h1>
          <p className="text-muted-foreground text-pretty">
            Import halal restaurants in bulk from an Excel or CSV file. Postcodes are geocoded
            automatically, and existing entries (matched by name and postcode) are updated rather
            than duplicated.
          </p>
        </div>
      </div>
      <UploadRestaurants />
    </main>
  )
}
