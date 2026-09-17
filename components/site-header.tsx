"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Lock, MessageSquare, Store, LogOut, HelpCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { BrandLogo } from "./brand-logo"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/", label: "Restaurants", icon: Store },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/sources", label: "Sources", icon: HelpCircle },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      setDisplayName(u ? ((u.user_metadata?.display_name as string) ?? u.email ?? null) : null)
      setLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
      setDisplayName(u ? ((u.user_metadata?.display_name as string) ?? u.email ?? null) : null)
      setLoaded(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setDisplayName(null)
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center">
          <BrandLogo className="h-9 w-auto object-contain sm:h-11" />
          <span className="sr-only">Explore Halal home</span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {loaded && displayName ? (
            <>
              <span className="hidden text-sm text-muted-foreground md:inline">
                Hi, <span className="font-medium text-foreground">{displayName}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Login
            </Link>
          )}
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground sm:px-3"
          >
            <Lock className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Admin</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
