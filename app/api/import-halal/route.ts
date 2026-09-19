import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb'; // Switch to Supabase/Postgres if needed

function generateMatchKey(name: string, postcode: string) {
  const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\b(the|restaurant|cafe|grill|bar|kitchen|ltd)\b/g, '');
  const cleanPostcode = (postcode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanName}_${cleanPostcode}`;
}

export async function GET(request: Request) {
  // Get city parameter from the URL
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=London' }, { status: 400 });
  }

  // Ensure DATABASE_URL is set in your Vercel Environment Variables
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL environment variable missing' }, { status: 500 });
  }

  const client = new MongoClient(process.env.DATABASE_URL);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('restaurants');

    // Fetch raw global data from GitHub
    const response = await fetch('https://githubusercontent.com');
    if (!response.ok) throw new Error('Failed to fetch dataset from GitHub');
    const rawRestaurants = await response.json();

    let insertedCount = 0;
    let skippedCount = 0;

    // Filter by city and halal keywords
    const filteredSpots = rawRestaurants.filter((item: any) => {
      const itemCity = (item.city || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      const cuisine = (item.cuisine || '').toLowerCase();

      const matchesCity = itemCity === targetCity.toLowerCase();
      const isHalal = name.includes('halal') || cuisine.includes('halal') || cuisine.includes('turkish') || cuisine.includes('lebanese') || cuisine.includes('moroccan');

      return matchesCity && isHalal;
    });

    // Run upsert de-duplication loop
    for (const item of filteredSpots) {
      const postcode = item.postcode || item.postal_code || "Unknown";
      const matchKey = generateMatchKey(item.name, postcode);
      const fullAddress = item.address || `${item.street || ''} ${item.housenumber || ''}, ${item.city || ''}`.trim();

      const result = await collection.updateOne(
        { match_key: matchKey },
        {
          \$setOnInsert: {
            name: item.name || "Halal Restaurant",
            address: fullAddress || "Address Not Provided",
            postcode: postcode,
            cuisine_type: item.cuisine || "Halal",
            certification_body: "Unspecified",
            certification_status: "Self-declared",
            source: "GitHub Open Dataset Import",
            match_key: matchKey,
            createdAt: new Date()
          }
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) insertedCount++;
      else skippedCount++;
    }

    return NextResponse.json({
      success: true,
      city: targetCity,
      newly_inserted: insertedCount,
      duplicates_skipped: skippedCount
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.close();
  }
}
