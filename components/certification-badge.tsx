import { ShieldCheck, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CertificationBody, CertificationStatus } from "@/lib/types"

function Pill({
  label,
  variant,
  className,
}: {
  label: string
  variant: "hmc" | "hfa" | "community"
  className?: string
}) {
  const Icon = variant === "community" ? Users : ShieldCheck
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        variant === "hmc" && "bg-hmc text-hmc-foreground",
        variant === "hfa" && "bg-hfa text-hfa-foreground",
        variant === "community" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

export function CertificationBadges({
  body,
  className,
}: {
  body: CertificationBody
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {(body === "HMC" || body === "BOTH") && (
        <Pill label="HMC" variant="hmc" />
      )}
      {(body === "HFA" || body === "BOTH") && (
        <Pill label="HFA" variant="hfa" />
      )}
      {body === "COMMUNITY" && (
        <Pill label="Community" variant="community" />
      )}
    </div>
  )
}

const STATUS_STYLES: Record<CertificationStatus, string> = {
  Certified: "bg-primary/12 text-primary",
  Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Expired: "bg-muted text-muted-foreground",
  Suspended: "bg-destructive/12 text-destructive",
  Unverified: "bg-muted text-muted-foreground",
}

export function StatusBadge({
  status,
  className,
}: {
  status: CertificationStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  )
}
