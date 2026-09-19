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
    const targetUrl = "https://parse.bot";
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 
        'X-API-Key': process.env.PARSE_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // ✅ Custom variables must be wrapped inside a "parameters" object block
      body: JSON.stringify({
        parameters: {
          location: targetCity,
          limit: 100
        }
      })
    });

    const rawText = await response.text();

    // 1. Safety check for completely blank or empty API returns
    if (!rawText || rawText.trim() === "") {
      return NextResponse.json({ 
        error: "Parse API returned an empty response.",
        hint: "Your authentication key or endpoint parameters may be incorrectly configured in Parse. Check your Parse.bot usage limits."
      }, { status: 500 });
    }

    // 2. Safety check for HTML fallback pages
    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({
        error: "The scraper pipeline returned a webpage layout instead of structured JSON data.",
        htmlSnippet: rawText.substring(0, 400)
      }, { status: 500 });
    }

    const data = JSON.parse(rawText);
    
    // Safely look through alternative formatting arrays returned by the parser
    const targetRestaurants = data.restaurants || data.results || data.data || (Array.isArray(data) ? data : []);
    
    let insertedCount = 0;
    let skippedCount = 0;

    for (const item of targetRestaurants) {
      if (!item.name) continue; 

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
