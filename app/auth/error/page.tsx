import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-heading text-2xl font-bold text-foreground">Sign-in link invalid</h1>
      <p className="text-pretty text-muted-foreground leading-relaxed">
        This magic link has expired or has already been used. Request a fresh link to continue to the forum.
      </p>
      <Button asChild>
        <Link href="/auth/login">Back to login</Link>
      </Button>
    </main>
  )
}
