"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { deleteThread, deleteComment } from "@/app/forum/actions"

type DeleteButtonProps = {
  className?: string
  label?: string
} & ({ kind: "thread"; id: string } | { kind: "comment"; id: string; threadId: string })

/**
 * Admin-only moderation control. Rendered only when the server has already
 * confirmed the admin session, so this is a UI affordance — the server actions
 * re-check `isAdmin()` before deleting anything.
 */
export function DeleteButton(props: DeleteButtonProps) {
  const { className, label = "Delete" } = props
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result =
        props.kind === "thread"
          ? await deleteThread({ id: props.id })
          : await deleteComment({ id: props.id, threadId: props.threadId })

      if (result.ok) {
        setConfirming(false)
        if (props.kind === "thread") router.push("/forum")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{props.kind === "thread" ? "Delete topic?" : "Delete?"}</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="font-semibold text-destructive transition-colors hover:underline disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          No
        </button>
        {error && <span className="text-destructive">{error}</span>}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive",
        className,
      )}
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}
