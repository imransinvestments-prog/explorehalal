"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { RestaurantWithDistance } from "@/lib/types"
import type { Coordinates } from "@/lib/distance"
import { DEFAULT_COORDS } from "@/lib/distance"

// Restaurant pins are canvas circle markers (the map uses preferCanvas), so
// thousands of results cost one canvas instead of thousands of DOM nodes.
function markerStyle(color: string, active: boolean): L.CircleMarkerOptions {
  return {
    radius: active ? 11 : 8,
    color: "white",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  }
}

function originIcon() {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:18px;height:18px;
      background:var(--muted-foreground);border:3px solid white;border-radius:9999px;
      box-shadow:0 0 0 4px oklch(from var(--muted-foreground) l c h / .25);
      transform:translate(-50%,-50%);
    "></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

// Canvas can't resolve CSS variables, so read the certification tokens once
// from the active theme. Falls back to the HMC token for unknown bodies.
let certColors: Record<string, string> | null = null

function markerColor(r: RestaurantWithDistance) {
  if (!certColors) {
    const style = getComputedStyle(document.documentElement)
    const hmc = style.getPropertyValue("--hmc").trim()
    const hfa = style.getPropertyValue("--hfa").trim()
    certColors = { HMC: hmc, HFA: hfa, BOTH: hmc }
  }
  return certColors[r.certification_body] ?? certColors.HMC
}

function popupHtml(r: RestaurantWithDistance) {
  const ratingBlock =
    typeof r.rating === "number" && r.rating > 0
      ? `<br /><span style="display:inline-flex;align-items:center;gap:3px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--gold)" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
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

// Cheaper camera moves on touch devices / when the user prefers reduced motion:
// long fly animations are the main source of jank on mobile.
function prefersInstantCamera() {
  if (typeof window === "undefined") return false
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  return coarse || reduced
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
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  const originMarkerRef = useRef<L.Marker | null>(null)
  const prevActiveRef = useRef<string | null>(null)
  // Keep the latest onSelect without re-running marker effects.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // Latest camera-positioning function + whether the map has ever been visible.
  const applyCameraRef = useRef<(() => void) | null>(null)
  const wasVisibleRef = useRef(false)

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
      // Mobile responsiveness: repaint after gestures settle rather than on
      // every frame, and skip intermediate tiles while zooming.
      preferCanvas: true,
      zoomAnimation: !prefersInstantCamera(),
      markerZoomAnimation: false,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      className: "map-tiles-dark",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    }).addTo(map)

    mapRef.current = map

    // The map may mount inside a hidden (display:none) container on mobile,
    // where Leaflet measures a zero-size viewport and never loads tiles. Watch
    // for the container becoming visible / resizing and recompute the size.
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const visible = width > 0 && height > 0
      if (!visible) {
        wasVisibleRef.current = false
        return
      }
      map.invalidateSize({ animate: false })
      // The first time the map becomes visible, its camera was computed against
      // a zero-size viewport, so re-apply it now that real dimensions exist —
      // otherwise tiles only load after a manual zoom.
      if (!wasVisibleRef.current) {
        wasVisibleRef.current = true
        applyCameraRef.current?.()
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current = new Map()
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

  // Sync restaurant markers only when the list itself changes. Selection is
  // handled separately so tapping a pin never rebuilds the whole layer.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = markersRef.current
    const nextIds = new Set(restaurants.map((r) => r.id))

    // Remove markers no longer in the list.
    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }

    // Add markers that are new to the list.
    for (const r of restaurants) {
      if (markers.has(r.id)) continue
      const marker = L.circleMarker(
        [r.latitude, r.longitude],
        markerStyle(markerColor(r), activeId === r.id),
      )
        .bindPopup(popupHtml(r))
        .addTo(map)
      marker.on("click", () => onSelectRef.current(r.id))
      markers.set(r.id, marker)
    }
    // activeId intentionally excluded: selection styling is a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurants])

  // Restyle only the markers whose active state changed.
  useEffect(() => {
    const markers = markersRef.current
    const prev = prevActiveRef.current

    if (prev && prev !== activeId) {
      const prevRestaurant = restaurants.find((r) => r.id === prev)
      const prevMarker = markers.get(prev)
      if (prevRestaurant && prevMarker) {
        prevMarker.setStyle(markerStyle(markerColor(prevRestaurant), false))
      }
    }

    if (activeId) {
      const activeRestaurant = restaurants.find((r) => r.id === activeId)
      const activeMarker = markers.get(activeId)
      if (activeRestaurant && activeMarker) {
        activeMarker.setStyle(markerStyle(markerColor(activeRestaurant), true))
        activeMarker.bringToFront()
      }
    }

    prevActiveRef.current = activeId
  }, [activeId, restaurants])

  // Move the camera to the active restaurant, or fit all points in view.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyCamera = () => {
      const instant = prefersInstantCamera()

      const active = restaurants.find((r) => r.id === activeId)
      if (active) {
        if (instant) {
          map.setView([active.latitude, active.longitude], 15, {
            animate: false,
          })
        } else {
          map.flyTo([active.latitude, active.longitude], 15, { duration: 0.6 })
        }
        return
      }

      const points: [number, number][] = restaurants.map((r) => [
        r.latitude,
        r.longitude,
      ])
      if (origin) points.push([origin.latitude, origin.longitude])

      if (points.length === 1) {
        map.setView(points[0], 14, { animate: false })
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), {
          padding: [48, 48],
          animate: !instant,
        })
      }
    }

    // Expose the latest camera logic so the resize observer can re-apply it
    // when the map first becomes visible.
    applyCameraRef.current = applyCamera

    // Only drive the camera while the map has a real size. If it is still
    // hidden (zero-size), the resize observer will apply the camera once it
    // becomes visible — running it now would compute against a 0px viewport
    // and leave tiles unloaded until a manual zoom.
    const size = map.getSize()
    if (size.x > 0 && size.y > 0) {
      applyCamera()
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
