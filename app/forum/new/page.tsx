import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { SiteHeader } from "@/components/site-header"
import { NewThreadForm } from "@/components/forum/new-thread-form"

export const dynamic = "force-dynamic"

export default async function NewThreadPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login?next=/forum/new")

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href="/forum"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to forum
        </Link>
        <h1 className="mb-6 font-heading text-2xl font-bold text-foreground text-balance">Start a new topic</h1>
        <NewThreadForm />
      </main>
    </div>
  )
}
