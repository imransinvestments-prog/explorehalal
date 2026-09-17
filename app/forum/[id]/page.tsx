import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { SiteHeader } from "@/components/site-header"
import { CommentForm } from "@/components/forum/comment-form"
import { CommentTree, type CommentNode } from "@/components/forum/comment-tree"
import { formatRelative } from "@/lib/format-date"
import { isAdmin } from "@/lib/admin-auth"
import { DeleteButton } from "@/components/forum/delete-button"

export const dynamic = "force-dynamic"

type CommentRow = {
  id: string
  body: string
  created_at: string
  parent_id: string | null
  profiles: { display_name: string } | null
}

function buildTree(rows: CommentRow[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>()
  const roots: CommentNode[] = []
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      author: row.profiles?.display_name ?? "Member",
      children: [],
    })
  }
  for (const row of rows) {
    const node = nodes.get(row.id)!
    if (row.parent_id && nodes.has(row.parent_id)) {
      nodes.get(row.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = await isAdmin()

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("id,title,body,created_at,profiles(display_name)")
    .eq("id", id)
    .maybeSingle()

  if (!thread) notFound()

  const { data: commentData } = await supabase
    .from("forum_comments")
    .select("id,body,created_at,parent_id,profiles(display_name)")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })

  const tree = buildTree((commentData ?? []) as unknown as CommentRow[])
  const author = (thread as unknown as { profiles: { display_name: string } | null }).profiles?.display_name ?? "Member"
  const total = commentData?.length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/forum"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to forum
        </Link>

        <article className="rounded-xl border border-border bg-card p-5">
          <h1 className="font-heading text-xl font-bold text-foreground text-balance sm:text-2xl">{thread.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{author}</span>
            <span aria-hidden="true">•</span>
            <span>{formatRelative(thread.created_at)}</span>
          </div>
          {thread.body && (
            <p className="mt-4 whitespace-pre-wrap text-pretty text-sm text-foreground/90 leading-relaxed">
              {thread.body}
            </p>
          )}
          {admin && (
            <div className="mt-4 flex justify-end border-t border-border pt-3">
              <DeleteButton kind="thread" id={thread.id} label="Delete topic" />
            </div>
          )}
        </article>

        <section className="mt-8">
          <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">
            {total} {total === 1 ? "reply" : "replies"}
          </h2>

          {user ? (
            <div className="mb-6">
              <CommentForm threadId={id} />
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <Link href={`/auth/login?next=/forum/${id}`} className="font-semibold text-primary hover:underline">
                Log in
              </Link>{" "}
              to join the conversation.
            </div>
          )}

          {tree.length > 0 ? (
            <CommentTree nodes={tree} threadId={id} canReply={Boolean(user)} isAdmin={admin} />
          ) : (
            <p className="text-sm text-muted-foreground">No replies yet. Start the discussion.</p>
          )}
        </section>
      </main>
    </div>
  )
}
