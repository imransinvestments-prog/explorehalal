"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { RestaurantWithDistance } from "@/lib/types"
import type { Coordinates } from "@/lib/distance"
import { DEFAULT_COORDS } from "@/lib/distance"

function markerIcon(color: string, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:${active ? 30 : 24}px;height:${active ? 30 : 24}px;
      background:${color};border:2px solid white;border-radius:9999px;
      box-shadow:0 1px 6px rgba(0,0,0,.35);
      transform:translate(-50%,-50%);
    "></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function originIcon() {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:18px;height:18px;
      background:oklch(0.55 0.02 155);border:3px solid white;border-radius:9999px;
      box-shadow:0 0 0 4px oklch(0.55 0.02 155 / .25);
      transform:translate(-50%,-50%);
    "></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

const CERT_COLORS: Record<string, string> = {
  HMC: "oklch(0.5 0.13 155)",
  HFA: "oklch(0.52 0.12 245)",
  BOTH: "oklch(0.5 0.13 155)",
}

function popupHtml(r: RestaurantWithDistance) {
  const ratingBlock =
    typeof r.rating === "number" && r.rating > 0
      ? `<br /><span style="display:inline-flex;align-items:center;gap:3px;">
          <span style="color:#f5a524;" aria-hidden="true">★</span>
          <strong>${r.rating.toFixed(1)}</strong>
          ${
            typeof r.review_count === "number" && r.review_count > 0
              ? `<span style="opacity:.7;">(${r.review_count.toLocaleString(
                  "en-GB",
                )})</span>`
              : ""
          }
        </span>`
      : ""

  const distanceLine = Number.isFinite(r.distanceMiles)
    ? `${r.distanceMiles.toFixed(1)} miles away`
    : (r.postcode ?? "")

  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

  return `<span class="font-semibold">${escape(r.name)}</span><br />
    ${escape(r.cuisine_type ?? "")} · ${escape(r.certification_body ?? "")}
    ${ratingBlock}
    <br />${escape(distanceLine)}`
}

export default function MapView({
  origin,
  restaurants,
  activeId,
  onSelect,
}: {
  origin: Coordinates | null
  restaurants: RestaurantWithDistance[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const originMarkerRef = useRef<L.Marker | null>(null)
  // Keep the latest onSelect without re-running marker effects.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Initialize the map exactly once, and tear it down fully on unmount.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialCenter: [number, number] = origin
      ? [origin.latitude, origin.longitude]
      : restaurants[0]
        ? [restaurants[0].latitude, restaurants[0].longitude]
        : [DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude]

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 13,
      scrollWheelZoom: true,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      className: "map-tiles-dark",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
      originMarkerRef.current = null
    }
    // Intentionally run once; subsequent updates are handled by other effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync the origin marker.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (originMarkerRef.current) {
      originMarkerRef.current.remove()
      originMarkerRef.current = null
    }

    if (origin) {
      originMarkerRef.current = L.marker([origin.latitude, origin.longitude], {
        icon: originIcon(),
      })
        .bindPopup("Your search location")
        .addTo(map)
    }
  }, [origin])

  // Sync restaurant markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    for (const r of restaurants) {
      const marker = L.marker([r.latitude, r.longitude], {
        icon: markerIcon(
          CERT_COLORS[r.certification_body] ?? CERT_COLORS.HMC,
          activeId === r.id,
        ),
      })
        .bindPopup(popupHtml(r))
        .addTo(map)

      marker.on("click", () => onSelectRef.current(r.id))
      markersRef.current.push(marker)
    }
  }, [restaurants, activeId])

  // Fly to the active restaurant, or fit all points in view.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const active = restaurants.find((r) => r.id === activeId)
    if (active) {
      map.flyTo([active.latitude, active.longitude], 15, { duration: 0.6 })
      return
    }

    const points: [number, number][] = restaurants.map((r) => [
      r.latitude,
      r.longitude,
    ])
    if (origin) points.push([origin.latitude, origin.longitude])

    if (points.length === 1) {
      map.setView(points[0], 14)
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48] })
    }
  }, [origin, restaurants, activeId])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "var(--muted)" }}
    />
  )
}
