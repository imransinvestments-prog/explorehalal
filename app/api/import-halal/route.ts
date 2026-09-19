import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=Chicago' }, { status: 400 });
  }

  const apiKey = process.env.PARSE_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseRole) {
    return NextResponse.json({ 
      error: 'Required environment variables are completely missing inside Vercel.',
      status: { hasApiKey: !!apiKey, hasSupabaseUrl: !!supabaseUrl, hasSupabaseRole: !!supabaseRole }
    }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseRole);

  try {
    // ✅ 1. Updated with your exact new working scraper ID
    const baseUrl = "https://api.parse.bot/scraper/7d525839-78db-4e5b-a6cb-7838a2d1a23e/search_restaurants";
    const targetUrl = new URL(baseUrl);
    
    targetUrl.searchParams.append("location", targetCity.trim());
    targetUrl.searchParams.append("limit", "20"); 

    // ✅ 2. Integrated the mandatory API-Snapshot-Version header from your curl
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: { 
        'X-API-Key': apiKey,
        'API-Snapshot-Version': '3',
        'Accept': 'application/json'
      },
      cache: 'no-store' 
    });

    const rawText = await response.text();

    if (!rawText || rawText.trim() === "") {
      return NextResponse.json({ 
        error: "Parse API returned an empty response string.",
        hint: "Double check your PARSE_API_KEY in Vercel to ensure it matches perfectly."
      }, { status: 500 });
    }

    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({
        error: "The API endpoint configuration returned a webpage layout rather than clean data.",
        htmlSnippet: rawText.substring(0, 400)
      }, { status: 500 });
    }

    const data = JSON.parse(rawText);
    
    // Safe Array Extraction layer
    let targetRestaurants: any[] = [];
    if (Array.isArray(data)) {
      targetRestaurants = data;
    } else if (data && typeof data === 'object') {
      const plausibleArray = data.restaurants || data.results || data.data || data.items;
      if (Array.isArray(plausibleArray)) {
        targetRestaurants = plausibleArray;
      } else {
        const foundArray = Object.values(data).find(val => Array.isArray(val));
        if (Array.isArray(foundArray)) {
          targetRestaurants = foundArray;
        } else {
          targetRestaurants = [data];
        }
      }
    }

    let insertedCount = 0;
    let skippedCount = 0;

    for (const item of targetRestaurants) {
      if (!item || typeof item !== 'object' || !item.name) continue; 

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
      duplicates_skipped: skippedCount,
      debug_raw_payload: data 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
