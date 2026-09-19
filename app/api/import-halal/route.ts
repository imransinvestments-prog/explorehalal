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
    const baseUrl = "https://api.parse.bot/scraper/7d525839-78db-4e5b-a6cb-7838a2d1a23e/search_restaurants";
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
    
    // Safe Array Extraction layer.
    // The Parse API nests the payload as { status, data: { restaurants: [...] } },
    // so we recursively search the object tree for the first array of records.
    const findRecordArray = (node: any, depth = 0): any[] | null => {
      if (Array.isArray(node)) return node;
      if (!node || typeof node !== 'object' || depth > 4) return null;
      const preferred = node.restaurants || node.results || node.items;
      if (Array.isArray(preferred)) return preferred;
      for (const value of Object.values(node)) {
        const found = findRecordArray(value, depth + 1);
        if (found) return found;
      }
      return null;
    };

    const targetRestaurants: any[] = findRecordArray(data) ?? [];

    let insertedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const item of targetRestaurants) {
      if (!item || typeof item !== 'object' || !item.name) continue; 

      const cleanName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanAddr = (item.address || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
      const matchKey = `${cleanName}_${cleanAddr}`;

      const lat = Number.parseFloat(item.latitude);
      const lng = Number.parseFloat(item.longitude);
      const ratingNum = Number.parseFloat(item.rating);
      const reviewNum = Number.parseInt(item.review_count, 10);
      const halalScore = Number.parseInt(item.halal_rank_score ?? item.halal_score, 10);
      const willReturn = Number.parseFloat(item.will_return_percentage ?? item.will_return);
      const googleRating = Number.parseFloat(item.google_rating);
      const googleReviews = Number.parseInt(item.google_review_count, 10);

      const addressParts = [item.address, item.city, item.state].filter(Boolean);

      const { error } = await supabase
        .from('restaurants')
        .upsert(
          {
            name: item.name,
            address: addressParts.length ? addressParts.join(', ') : "Address Not Listed",
            postcode: item.state || "N/A",
            latitude: Number.isFinite(lat) ? lat : 0,
            longitude: Number.isFinite(lng) ? lng : 0,
            cuisine_type: Array.isArray(item.cuisine) ? item.cuisine.join(', ') : (item.cuisine || "Halal"),
            // The table's CHECK constraints only allow a fixed set of values.
            // Zabihah is community-sourced data, so it maps to COMMUNITY / Other with a
            // dedicated 'zabihah' certification_status that flags the source.
            certification_body: "COMMUNITY",
            certification_status: "zabihah",
            certification_type: "Other",
            rating: Number.isFinite(ratingNum) ? ratingNum : null,
            review_count: Number.isFinite(reviewNum) ? reviewNum : null,
            image_url: item.cover_image || null,
            last_scraped_date: today,
            source: "Zabihah.com Parse Import",
            match_key: matchKey,
            // Zabihah's richer halal detail, preserved on their own columns.
            price: item.price ?? null,
            halal_status: item.halal_status ?? null,
            halal_description: item.halal_description ?? null,
            alcohol_policy: item.alcohol_policy ?? item.alcohol ?? null,
            halal_rank_score: Number.isFinite(halalScore) ? halalScore : null,
            halal_rank_tier: item.halal_rank_tier ?? item.halal_tier ?? null,
            hand_slaughtered: typeof item.hand_slaughtered === 'boolean' ? item.hand_slaughtered : null,
            is_trending: typeof item.is_trending === 'boolean' ? item.is_trending : null,
            will_return_percentage: Number.isFinite(willReturn) ? willReturn : null,
            google_rating: Number.isFinite(googleRating) ? googleRating : null,
            google_review_count: Number.isFinite(googleReviews) ? googleReviews : null,
            business_hours: item.business_hours ?? item.hours ?? null,
          },
          { onConflict: 'match_key' }
        );

      if (!error) {
        insertedCount++;
      } else {
        skippedCount++;
        if (errors.length < 5) errors.push(`${item.name}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      city: targetCity,
      total_found: targetRestaurants.length,
      newly_inserted: insertedCount,
      duplicates_skipped: skippedCount,
      sample_errors: errors,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
