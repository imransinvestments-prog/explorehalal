import Link from "next/link"
import { MessageSquare, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { SiteHeader } from "@/components/site-header"
import { formatRelative } from "@/lib/format-date"
import { isAdmin } from "@/lib/admin-auth"
import { DeleteButton } from "@/components/forum/delete-button"

export const metadata = {
  title: "Halal Food Forum — Reviews, Recommendations & Discussion",
  description:
    "Join the Explore Halal community forum to share halal restaurant reviews, ask for recommendations, and discuss the best halal food, takeaways, and dining spots near you.",
  alternates: { canonical: "/forum" },
}

export const dynamic = "force-dynamic"

type ThreadRow = {
  id: string
  title: string
  body: string
  created_at: string
  profiles: { display_name: string } | null
  forum_comments: { count: number }[]
}

export default async function ForumPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = await isAdmin()

  const { data } = await supabase
    .from("forum_threads")
    .select("id,title,body,created_at,profiles(display_name),forum_comments(count)")
    .order("created_at", { ascending: false })

  const threads = (data ?? []) as unknown as ThreadRow[]

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground text-balance">Community Forum</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground leading-relaxed">
              Ask questions, share finds, and discuss halal dining across the UK.
            </p>
          </div>
          <Link
            href={user ? "/forum/new" : "/auth/login?next=/forum/new"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" aria-hidden="true" />
            New topic
          </Link>
        </div>

        {threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent/15">
              <MessageSquare className="size-6 text-accent" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-foreground">No topics yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Be the first to start a discussion.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {threads.map((thread) => {
              const replies = thread.forum_comments?.[0]?.count ?? 0
              return (
                <li
                  key={thread.id}
                  className="rounded-xl border border-border bg-card transition-colors hover:border-accent/60 hover:bg-accent/5"
                >
                  <Link href={`/forum/${thread.id}`} className="block p-4">
                    <h3 className="font-heading text-base font-semibold text-foreground text-pretty">{thread.title}</h3>
                    {thread.body && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground leading-relaxed">{thread.body}</p>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{thread.profiles?.display_name ?? "Member"}</span>
                      <span aria-hidden="true">•</span>
                      <span>{formatRelative(thread.created_at)}</span>
                      <span aria-hidden="true">•</span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        {replies} {replies === 1 ? "reply" : "replies"}
                      </span>
                    </div>
                  </Link>
                  {admin && (
                    <div className="flex justify-end border-t border-border px-4 py-2">
                      <DeleteButton kind="thread" id={thread.id} label="Delete topic" />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
