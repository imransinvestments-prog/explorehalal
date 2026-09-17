export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/images/explore-halal-logo.png"
      alt="Explore Halal"
      className={className ?? "h-full w-auto object-contain"}
    />
  )
}
