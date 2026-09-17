"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeft, Lock, Loader2 } from "lucide-react"
import { adminLogin, type AdminLoginState } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const INITIAL: AdminLoginState = {}

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLogin, INITIAL)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to finder
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground">Admin access</h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Enter the admin password to view search analytics and manage data.
            </p>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </main>
  )
}
