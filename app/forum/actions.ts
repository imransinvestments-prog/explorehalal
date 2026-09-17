"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdmin } from "@/lib/admin-auth"

export type ForumActionResult = { ok: true; id?: string } | { ok: false; error: string }

export async function createThread(input: { title: string; body: string }): Promise<ForumActionResult> {
  const title = input.title?.trim()
  const body = input.body?.trim() ?? ""

  if (!title) return { ok: false, error: "Please add a title for your topic." }
  if (title.length > 160) return { ok: false, error: "Title must be 160 characters or fewer." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "You must be signed in to post." }

  const { data, error } = await supabase
    .from("forum_threads")
    .insert({ title, body, author_id: user.id })
    .select("id")
    .single()

  if (error) return { ok: false, error: "Could not create the topic. Please try again." }

  revalidatePath("/forum")
  return { ok: true, id: data.id }
}

export async function createComment(input: {
  threadId: string
  body: string
  parentId?: string | null
}): Promise<ForumActionResult> {
  const body = input.body?.trim()
  if (!body) return { ok: false, error: "Comment can't be empty." }
  if (body.length > 5000) return { ok: false, error: "Comment is too long." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "You must be signed in to comment." }

  const { error } = await supabase.from("forum_comments").insert({
    thread_id: input.threadId,
    parent_id: input.parentId ?? null,
    body,
    author_id: user.id,
  })

  if (error) return { ok: false, error: "Could not post your comment. Please try again." }

  revalidatePath(`/forum/${input.threadId}`)
  return { ok: true }
}

/**
 * Admin-only moderation. The admin session is a signed cookie (see
 * `lib/admin-auth`), not a Supabase auth user, so these deletes go through the
 * service-role client to bypass RLS. Deletes cascade: removing a thread also
 * removes its comments, and removing a comment removes its child replies.
 */
export async function deleteThread(input: { id: string }): Promise<ForumActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorized." }

  const admin = createAdminClient()
  const { error } = await admin.from("forum_threads").delete().eq("id", input.id)
  if (error) return { ok: false, error: "Could not delete the topic. Please try again." }

  revalidatePath("/forum")
  return { ok: true }
}

export async function deleteComment(input: { id: string; threadId: string }): Promise<ForumActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorized." }

  const admin = createAdminClient()
  const { error } = await admin.from("forum_comments").delete().eq("id", input.id)
  if (error) return { ok: false, error: "Could not delete the comment. Please try again." }

  revalidatePath(`/forum/${input.threadId}`)
  return { ok: true }
}
