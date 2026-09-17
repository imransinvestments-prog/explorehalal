import * as XLSX from "xlsx"
import { isAdmin } from "@/lib/admin-auth"
import { fetchRestaurants } from "@/lib/restaurants-server"

// Always build the workbook from live data.
export const dynamic = "force-dynamic"

export async function GET() {
  if (!(await isAdmin())) {
    return new Response("Unauthorized", { status: 401 })
  }

  const restaurants = await fetchRestaurants()

  const rows = restaurants.map((r) => ({
    Name: r.name,
    Address: r.address,
    Postcode: r.postcode,
    Latitude: r.latitude,
    Longitude: r.longitude,
    Cuisine: r.cuisine_type,
    "Cuisine group": r.cuisine_group ?? "",
    "Certification body": r.certification_body,
    "Certification status": r.certification_status,
    Source: r.source ?? "",
    "Last updated": r.last_scraped_date,
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)

  // Give each column a sensible width so the export is readable on open.
  worksheet["!cols"] = [
    { wch: 34 }, // Name
    { wch: 44 }, // Address
    { wch: 10 }, // Postcode
    { wch: 11 }, // Latitude
    { wch: 11 }, // Longitude
    { wch: 22 }, // Cuisine
    { wch: 20 }, // Cuisine group
    { wch: 16 }, // Certification body
    { wch: 18 }, // Certification status
    { wch: 16 }, // Source
    { wch: 22 }, // Last updated
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Restaurants")

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer

  const date = new Date().toISOString().slice(0, 10)

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="explore-halal-restaurants-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
