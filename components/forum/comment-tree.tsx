"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/format-date"
import { CommentForm } from "./comment-form"
import { DeleteButton } from "./delete-button"

export type CommentNode = {
  id: string
  body: string
  createdAt: string
  author: string
  children: CommentNode[]
}

function Comment({
  node,
  threadId,
  canReply,
  isAdmin,
  depth,
}: {
  node: CommentNode
  threadId: string
  canReply: boolean
  isAdmin: boolean
  depth: number
}) {
  const [replying, setReplying] = useState(false)

  return (
    <div className={cn(depth > 0 && "border-l border-border pl-4")}>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{node.author}</span>
          <span aria-hidden="true">•</span>
          <span>{formatRelative(node.createdAt)}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-pretty text-sm text-foreground/90 leading-relaxed">{node.body}</p>
        {(canReply || isAdmin) && (
          <div className="mt-2 flex items-center gap-3">
            {canReply && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="text-xs font-medium text-primary transition-colors hover:underline"
              >
                {replying ? "Cancel" : "Reply"}
              </button>
            )}
            {isAdmin && <DeleteButton kind="comment" id={node.id} threadId={threadId} />}
          </div>
        )}
        {replying && (
          <div className="mt-3">
            <CommentForm
              threadId={threadId}
              parentId={node.id}
              placeholder={`Reply to ${node.author}…`}
              autoFocus
              onDone={() => setReplying(false)}
            />
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {node.children.map((child) => (
            <Comment
              key={child.id}
              node={child}
              threadId={threadId}
              canReply={canReply}
              isAdmin={isAdmin}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentTree({
  nodes,
  threadId,
  canReply,
  isAdmin = false,
}: {
  nodes: CommentNode[]
  threadId: string
  canReply: boolean
  isAdmin?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {nodes.map((node) => (
        <Comment key={node.id} node={node} threadId={threadId} canReply={canReply} isAdmin={isAdmin} depth={0} />
      ))}
    </div>
  )
}
