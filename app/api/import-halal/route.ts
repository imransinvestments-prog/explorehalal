import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=London' }, { status: 400 });
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
    // ✅ 1. Reverted to standard Parse.bot GET endpoint path format
    const baseUrl = "https://parse.bot";
    const targetUrl = new URL(baseUrl);
    
    // ✅ 2. Append parameters directly as standard URL query strings
    targetUrl.searchParams.append("location", targetCity);
    targetUrl.searchParams.append("limit", "20"); // Safely stay well within credit limits
    
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: { 
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });

    const rawText = await response.text();

    if (!rawText || rawText.trim() === "") {
      return NextResponse.json({ 
        error: "Parse API returned a completely blank response string.",
        hint: "Check your query arguments or test the endpoint inside the Parse.bot panel directly to verify data availability."
      }, { status: 500 });
    }

    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({
        error: "The API endpoint configuration returned a webpage layout rather than clean data rows.",
        htmlSnippet: rawText.substring(0, 400)
      }, { status: 500 });
    }

    const data = JSON.parse(rawText);
    
    // ✅ 3. Flexible extraction strategy to target arrays returned by Parse
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
      duplicates_skipped: skippedCount,
      // Debug payload fallback flag to view structural mapping properties
      debug_sample: targetRestaurants.slice(0, 1)
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
