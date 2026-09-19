import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=London' }, { status: 400 });
  }

  // Ensure your free Parse API key is added to your Vercel Dashboard alongside your Supabase keys
  if (!process.env.PARSE_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Required environment variables are missing' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Query the live Parse.bot Zabihah mirror (Returns up to 300 restaurants per city)
    const url = `https://parse.bot{encodeURIComponent(targetCity)}`;
    
    const response = await fetch(url, {
      headers: { 'X-API-Key': process.env.PARSE_API_KEY }
    });

    if (!response.ok) throw new Error(`Zabihah stream failed: ${response.statusText}`);
    const data = await response.json();
    
    const targetRestaurants = data.restaurants || [];
    let insertedCount = 0;
    let skippedCount = 0;

    // 2. Map fields directly into your exact Supabase table layout
    for (const item of targetRestaurants) {
      // Build an explicit matching key format using lower-case letters & digits
      const cleanName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanAddr = (item.address || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
      const matchKey = `${cleanName}_${cleanAddr}`;

      const { error } = await supabase
        .from('restaurants')
        .upsert(
          {
            name: item.name,
            address: item.address || "Address Not Listed",
            postcode: "See Address",
            cuisine_type: Array.isArray(item.cuisine) ? item.cuisine.join(', ') : (item.cuisine || "Halal"),
            certification_body: item.halal_description || "Zabihah Community Verified",
            certification_status: item.halal_rank_tier || "Verified",
            source: "Zabihah.com Parse Import",
            match_key: matchKey
          },
          { onConflict: 'match_key' }
        );

      if (!error) insertedCount++;
      else skippedCount++;
    }

    return NextResponse.json({
      success: true,
      city: targetCity,
      total_found_on_zabihah: targetRestaurants.length,
      newly_inserted: insertedCount,
      duplicates_skipped: skippedCount
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
