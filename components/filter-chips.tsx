"use client"

import { BadgeCheck, Beef, ShieldCheck, Users, UtensilsCrossed, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ButchersMode } from "@/lib/restaurants"
import type { CertificationType } from "@/lib/types"

export interface ChipState {
  /** Selected certification types (HMC / HFA / Other). Empty = show all. */
  certTypes: CertificationType[]
  butchers: ButchersMode
}

export const INITIAL_CHIPS: ChipState = {
  certTypes: [],
  butchers: null,
}

interface FilterChipsProps {
  value: ChipState
  onChange: (next: ChipState) => void
}

const CERT_TYPE_CHIPS: {
  type: CertificationType
  label: string
  icon: React.ReactNode
}[] = [
  { type: "HMC", label: "HMC", icon: <BadgeCheck className="size-3.5" aria-hidden="true" /> },
  { type: "HFA", label: "HFA", icon: <ShieldCheck className="size-3.5" aria-hidden="true" /> },
  { type: "Other", label: "Self-certified", icon: <Users className="size-3.5" aria-hidden="true" /> },
]

export function FilterChips({ value, onChange }: FilterChipsProps) {
  const anyActive = value.certTypes.length > 0 || value.butchers !== null

  function toggleType(type: CertificationType) {
    const next = value.certTypes.includes(type)
      ? value.certTypes.filter((t) => t !== type)
      : [...value.certTypes, type]
    onChange({ ...value, certTypes: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {CERT_TYPE_CHIPS.map(({ type, label, icon }) => (
        <Chip
          key={type}
          active={value.certTypes.includes(type)}
          onClick={() => toggleType(type)}
          icon={icon}
        >
          {label}
        </Chip>
      ))}

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <Chip
        active={value.butchers === "only"}
        onClick={() =>
          onChange({
            ...value,
            butchers: value.butchers === "only" ? null : "only",
          })
        }
        icon={<Beef className="size-3.5" aria-hidden="true" />}
      >
        Only Butchers
      </Chip>

      <Chip
        active={value.butchers === "exclude"}
        onClick={() =>
          onChange({
            ...value,
            butchers: value.butchers === "exclude" ? null : "exclude",
          })
        }
        icon={<UtensilsCrossed className="size-3.5" aria-hidden="true" />}
      >
        Exclude Butchers
      </Chip>

      {anyActive && (
        <button
          type="button"
          onClick={() => onChange(INITIAL_CHIPS)}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
