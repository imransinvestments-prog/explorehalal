"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"

type SendResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Generates a real Supabase email OTP via the admin API (which returns the
 * 6-digit code WITHOUT sending Supabase's own email) and delivers it through
 * Resend. This bypasses Supabase's email templates and built-in rate limits
 * entirely, while keeping a genuine Supabase session — the client still calls
 * verifyOtp with the returned code.
 */
export async function sendLoginCode(input: { name: string; email: string }): Promise<SendResult> {
  const name = input.name?.trim() ?? ""
  const email = input.email?.trim().toLowerCase() ?? ""

  if (!name) return { ok: false, error: "Please enter your name." }
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." }

  const admin = createAdminClient()

  // Ensure the user exists so a magiclink OTP can be generated for them.
  // createUser is idempotent enough for our needs: if the address is already
  // registered it returns an error we can safely ignore.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { display_name: name },
  })

  if (createError && !/registered|already/i.test(createError.message)) {
    console.log("[v0] createUser error:", createError.message)
    return { ok: false, error: "We couldn't start sign-in for that email. Please try again." }
  }

  // Generate the OTP without sending Supabase's email.
  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  const otp = data?.properties?.email_otp
  if (linkError || !otp) {
    console.log("[v0] generateLink error:", linkError?.message)
    return { ok: false, error: "We couldn't generate a sign-in code. Please try again." }
  }

  // TEMPORARY: using Resend's shared onboarding sender for testing before the
  // explorehalal.co.uk domain is verified. This can ONLY deliver to the email
  // that owns the Resend account. Switch back to noreply@${RESEND_EMAIL_DOMAIN}
  // once the domain shows Verified on resend.com/domains.
  const from = `Explore Halal <onboarding@resend.dev>`
  const resend = new Resend(process.env.RESEND_API_KEY)

  const { error: sendError } = await resend.emails.send({
    from,
    to: email,
    subject: `${otp} is your Explore Halal sign-in code`,
    text: `Your Explore Halal sign-in code is ${otp}. It expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;font-size:20px">Your sign-in code</h2>
        <p style="margin:0 0 16px;color:#555;font-size:14px">Enter this 6-digit code to confirm your email and join the community.</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${otp}</p>
        <p style="margin:0;color:#888;font-size:13px">This code expires in 1 hour. If you didn't request it, you can safely ignore this email.</p>
      </div>
    `,
  })

  if (sendError) {
    console.log("[v0] resend error:", sendError.message ?? sendError)
    return { ok: false, error: "We couldn't email your code. Please try again in a moment." }
  }

  return { ok: true }
}
