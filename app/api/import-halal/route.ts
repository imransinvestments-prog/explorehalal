import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetCity = searchParams.get('city');

  if (!targetCity) {
    return NextResponse.json({ error: 'Please provide a city parameter, e.g., ?city=Manchester' }, { status: 400 });
  }

  // ✅ Reads securely from Vercel's Dashboard Environment Variables system
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
    const baseUrl = "https://parse.bot";
    const targetUrl = new URL(baseUrl);
    
    targetUrl.searchParams.append("location", targetCity.trim());
    targetUrl.searchParams.append("limit", "20"); 

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
      return NextResponse.json({ error: "Parse API returned an empty response string." }, { status: 500 });
    }

    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({
        error: "The API endpoint configuration returned a webpage layout rather than clean data.",
        htmlSnippet: rawText.substring(0, 400)
      }, { status: 500 });
    }

    const data = JSON.parse(rawText);
    
    let targetRestaurants: any[] = [];
    if (data && data.data && Array.isArray(data.data.restaurants)) {
      targetRestaurants = data.data.restaurants;
    } else if (Array.isArray(data.restaurants)) {
      targetRestaurants = data.restaurants;
    } else if (Array.isArray(data)) {
      targetRestaurants = data;
    } else if (data && typeof data === 'object') {
      const fallback = data.results || data.data || data.items;
      targetRestaurants = Array.isArray(fallback) ? fallback : [data];
    }

    let insertedCount = 0;
    let skippedCount = 0;
    let databaseErrors: any[] = []; 

    for (const item of targetRestaurants) {
      if (!item || typeof item !== 'object' || !item.name) continue; 

      const cleanName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanAddr = (item.address || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
      const matchKey = `${cleanName}_${cleanAddr}`;

      const cuisineString = Array.isArray(item.cuisine) 
        ? item.cuisine.join(', ') 
        : (typeof item.cuisine === 'string' ? item.cuisine : "Halal");

      const { error } = await supabase
        .from('restaurants')
        .upsert(
          {
            name: item.name,
            address: item.address || "Address Not Listed",
            postcode: "See Address",
            cuisine_type: cuisineString,
            certification_body: item.halal_description || "Zabihah Community Verified",
            certification_status: item.halal_rank_tier || "Verified",
            source: "Zabihah.com Parse Import",
            match_key: matchKey
          },
          { onConflict: 'match_key' }
        );

      if (!error) {
        insertedCount++;
      } else {
        skippedCount++;
        databaseErrors.push({ 
          restaurant: item.name, 
          message: error.message, 
          details: error.details,
          code: error.code 
        });
      }
    }

    return NextResponse.json({
      success: true,
      city: targetCity,
      total_found: targetRestaurants.length,
      newly_inserted: insertedCount,
      duplicates_or_errors_skipped: skippedCount,
      supabase_diagnostic_logs: databaseErrors, 
      debug_raw_api_response: data
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
