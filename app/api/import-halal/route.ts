import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=London' }, { status: 400 });
  }

  if (!process.env.PARSE_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Required environment variables are missing' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // ✅ 1. Correct base API subdomain & specific endpoint action route
    const baseUrl = "https://parse.bot";
    const targetUrl = new URL(baseUrl);
    
    // ✅ 2. Safely append parameters for the Parse query
    targetUrl.searchParams.append("limit", "100");
    targetUrl.searchParams.append("location", targetCity);
    
    // ✅ 3. Fire request to the correct live cloud endpoint
    const response = await fetch(targetUrl.toString(), {
      headers: { 
        'X-API-Key': process.env.PARSE_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Zabihah stream failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Note: If Parse returns an un-wrapped array directly, change this fallback to: data || [];
    const targetRestaurants = data.restaurants || data.results || data || [];
    
    let insertedCount = 0;
    let skippedCount = 0;

    for (const item of targetRestaurants) {
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
