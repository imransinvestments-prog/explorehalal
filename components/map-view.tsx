"use client"

import { useEffect, useMemo } from "react"
import L from "leaflet"
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet"
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

function MapController({
  origin,
  restaurants,
  activeId,
}: {
  origin: Coordinates | null
  restaurants: RestaurantWithDistance[]
  activeId: string | null
}) {
  const map = useMap()

  useEffect(() => {
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
  }, [map, origin, restaurants, activeId])

  return null
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
  const center = useMemo<[number, number]>(() => {
    if (origin) return [origin.latitude, origin.longitude]
    if (restaurants[0])
      return [restaurants[0].latitude, restaurants[0].longitude]
    return [DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude]
  }, [origin, restaurants])

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "var(--muted)" }}
    >
      <TileLayer
        className="map-tiles-dark"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {origin && (
        <Marker
          position={[origin.latitude, origin.longitude]}
          icon={originIcon()}
        >
          <Popup>Your search location</Popup>
        </Marker>
      )}

      {restaurants.map((r) => (
        <Marker
          key={r.id}
          position={[r.latitude, r.longitude]}
          icon={markerIcon(
            CERT_COLORS[r.certification_body] ?? CERT_COLORS.HMC,
            activeId === r.id,
          )}
          eventHandlers={{ click: () => onSelect(r.id) }}
        >
          <Popup>
            <span className="font-semibold">{r.name}</span>
            <br />
            {r.cuisine_type} · {r.certification_body}
            {typeof r.rating === "number" && r.rating > 0 && (
              <>
                <br />
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                >
                  <span style={{ color: "#f5a524" }} aria-hidden="true">
                    ★
                  </span>
                  <strong>{r.rating.toFixed(1)}</strong>
                  {typeof r.review_count === "number" && r.review_count > 0 && (
                    <span style={{ opacity: 0.7 }}>
                      {`(${r.review_count.toLocaleString("en-GB")})`}
                    </span>
                  )}
                </span>
              </>
            )}
            <br />
            {Number.isFinite(r.distanceMiles)
              ? `${r.distanceMiles.toFixed(1)} miles away`
              : r.postcode}
          </Popup>
        </Marker>
      ))}

      <MapController
        origin={origin}
        restaurants={restaurants}
        activeId={activeId}
      />
    </MapContainer>
  )
}
