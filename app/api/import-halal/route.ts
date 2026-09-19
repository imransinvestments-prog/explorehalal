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
    const targetUrl = "https://parse.bot";
    
    // ✅ Multi-mapping configuration payload block to prevent empty schema returns
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        location: targetCity,  // Traditional mapping parameter
        city: targetCity,      // Alternating schema parameter fallback
        query: targetCity,     // Generic search fallback parameter
        limit: 20 
      })
    });

    const rawText = await response.text();

    let data;
    if (!rawText || rawText.trim() === "") {
      data = { restaurants: [] };
    } else if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({
        error: "The API endpoint configuration returned a webpage layout rather than clean data rows.",
        htmlSnippet: rawText.substring(0, 400)
      }, { status: 500 });
    } else {
      data = JSON.parse(rawText);
    }
    
    // Check all possible response array paths commonly used by Parse
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
      debug_raw_api_response: data // Lets us see exactly how the array fields are packaged
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
