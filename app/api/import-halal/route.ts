import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function generateMatchKey(name: string, postcode: string) {
  const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\b(the|restaurant|cafe|grill|bar|kitchen|ltd)\b/g, '');
  const cleanPostcode = (postcode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanName}_${cleanPostcode}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=London' }, { status: 400 });
  }

  // Ensure Supabase environment credentials are live in your Vercel dashboard
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase environment variables are missing' }, { status: 500 });
  }

  // Initialize the Supabase admin client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Fetch open-source dataset from GitHub
    const response = await fetch('https://githubusercontent.com');
    if (!response.ok) throw new Error('Failed to fetch dataset from GitHub');
    const rawRestaurants = await response.json();

    let insertedCount = 0;
    let skippedCount = 0;

    // Filter locations by city and halal keywords
    const filteredSpots = rawRestaurants.filter((item: any) => {
      const itemCity = (item.city || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      const cuisine = (item.cuisine || '').toLowerCase();

      const matchesCity = itemCity === targetCity.toLowerCase();
      const isHalal = name.includes('halal') || cuisine.includes('halal') || cuisine.includes('turkish') || cuisine.includes('lebanese') || cuisine.includes('moroccan');

      return matchesCity && isHalal;
    });

    // Run clean upsert loop using Supabase syntax
    for (const item of filteredSpots) {
      const postcode = item.postcode || item.postal_code || "Unknown";
      const matchKey = generateMatchKey(item.name, postcode);
      const fullAddress = item.address || `${item.street || ''} ${item.housenumber || ''}, ${item.city || ''}`.trim();

      // Upsert into your Supabase table (Assumes your table is named 'restaurants')
      const { data, error } = await supabase
        .from('restaurants')
        .upsert(
          {
            name: item.name || "Halal Restaurant",
            address: fullAddress || "Address Not Provided",
            postcode: postcode,
            cuisine_type: item.cuisine || "Halal",
            certification_body: "Unspecified",
            certification_status: "Self-declared",
            source: "GitHub Open Dataset Import",
            match_key: matchKey
          },
          { onConflict: 'match_key' } // Prevents structural duplicates
        );

      if (!error) {
        insertedCount++;
      } else {
        skippedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      city: targetCity,
      processed_records: filteredSpots.length,
      status: "Pipeline ran successfully"
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
