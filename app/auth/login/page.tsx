"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { sendLoginCode } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandLogo } from "@/components/brand-logo"
import { Mail, ArrowLeft } from "lucide-react"

const SEND_COOLDOWN_SECONDS = 45

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/forum"

  const [step, setStep] = useState<"details" | "code">("details")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "verifying">("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<"error" | "info">("error")
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1 && timerRef.current) clearInterval(timerRef.current)
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [cooldown])

  function showMessage(text: string, tone: "error" | "info") {
    setMessage(text)
    setMessageTone(tone)
  }

  async function sendCode() {
    const result = await sendLoginCode({ name: name.trim(), email: email.trim() })
    return result.ok ? null : result.error
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || cooldown > 0) return

    setStatus("sending")
    setMessage(null)

    const error = await sendCode()
    setStatus("idle")

    if (error) {
      showMessage(error, "error")
      return
    }

    setCooldown(SEND_COOLDOWN_SECONDS)
    setStep("code")
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const token = code.trim()
    if (token.length < 6) return

    setStatus("verifying")
    setMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    })

    if (error) {
      setStatus("idle")
      showMessage(
        error.message.toLowerCase().includes("expired")
          ? "That code has expired. Request a new one below."
          : "That code isn't right. Check the 6 digits and try again.",
        "error",
      )
      return
    }

    router.push(next)
    router.refresh()
  }

  async function handleResend() {
    if (cooldown > 0) return
    setStatus("sending")
    setMessage(null)
    const error = await sendCode()
    setStatus("idle")
    if (error) {
      if (error.message.toLowerCase().includes("rate") || error.status === 429) {
        setCooldown(SEND_COOLDOWN_SECONDS)
        showMessage("Too many requests. Please wait for the timer, then try again.", "error")
      } else {
        showMessage("Couldn't resend. Try again in a moment.", "error")
      }
      return
    }
    setCooldown(SEND_COOLDOWN_SECONDS)
    showMessage("A new code is on its way.", "info")
  }

  const sendDisabled = status === "sending" || cooldown > 0
  const sendLabel =
    status === "sending" ? "Sending code…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Send code"

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandLogo className="h-12 w-auto" />
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground text-balance">Join the community</h1>
          <p className="mt-1 text-pretty text-sm text-muted-foreground leading-relaxed">
            {step === "details"
              ? "Enter your name and email. We'll send a 6-digit code to confirm your address before you post."
              : `Enter the 6-digit code we emailed to ${email}.`}
          </p>
        </div>
      </div>

      {step === "details" ? (
        <form onSubmit={handleSendCode} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              autoComplete="name"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          {message && (
            <p className={messageTone === "info" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              {message}
            </p>
          )}
          <Button type="submit" disabled={sendDisabled} className="w-full">
            {sendLabel}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-full bg-accent">
            <Mail className="size-6 text-accent-foreground" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="text-center text-lg tracking-[0.5em]"
              autoFocus
              required
            />
          </div>
          {message && (
            <p className={messageTone === "info" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              {message}
            </p>
          )}
          <Button type="submit" disabled={status === "verifying" || code.length < 6} className="w-full">
            {status === "verifying" ? "Verifying…" : "Verify & continue"}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("details")
                setCode("")
                setMessage(null)
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={sendDisabled}
              className="text-accent transition-colors hover:underline disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      <Link
        href="/"
        className="mx-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to restaurants
      </Link>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
