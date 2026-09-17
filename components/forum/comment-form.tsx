"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createComment } from "@/app/forum/actions"

export function CommentForm({
  threadId,
  parentId = null,
  placeholder = "Add a reply…",
  onDone,
  autoFocus = false,
}: {
  threadId: string
  parentId?: string | null
  placeholder?: string
  onDone?: () => void
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createComment({ threadId, body, parentId })
      if (result.ok) {
        setBody("")
        onDone?.()
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Reply"}
        </Button>
      </div>
    </form>
  )
}
