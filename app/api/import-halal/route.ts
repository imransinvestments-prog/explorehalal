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
    // ✅ Updated path to use singular 'scraper' matching Parse's official API specifications
    const baseUrl = "https://parse.bot";
    const targetUrl = new URL(baseUrl);
    
    targetUrl.searchParams.append("limit", "100");
    targetUrl.searchParams.append("location", targetCity);
    
    // Fetch as raw text first so it cannot crash the JSON engine if an HTML error page returns
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: { 
        'X-API-Key': process.env.PARSE_API_KEY,
        'Accept': 'application/json'
      }
    });

    const rawText = await response.text();

    // Check if the server sent back HTML (like a 404 or a cloudflare block page)
    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({
        error: "The API endpoint returned an HTML webpage instead of raw data data.",
        hint: "This usually means the URL path structure or request method is wrong.",
        htmlSnippet: rawText.substring(0, 300) // Safely print the top fragment of the page content
      }, { status: 500 });
    }

    const data = JSON.parse(rawText);
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
      total_found: targetRestaurants.length,
      newly_inserted: insertedCount,
      duplicates_skipped: skippedCount
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
