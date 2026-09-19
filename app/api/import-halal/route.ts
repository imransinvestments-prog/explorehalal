  try {
    // 1. Target URL
    const baseUrl = "https://parse.bot";
    const targetUrl = new URL(baseUrl);
    
    targetUrl.searchParams.append("limit", "100");
    targetUrl.searchParams.append("location", targetCity);
    
    // 2. Fetching raw response text first to handle HTML safeguards safely
    const response = await fetch(targetUrl.toString(), {
      method: 'GET', // Change to 'POST' if the debug output says "Method Not Allowed"
      headers: { 
        'X-API-Key': process.env.PARSE_API_KEY || '',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const rawText = await response.text();

    // Catch if the response is an HTML page or error block instead of JSON
    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      return NextResponse.json({ 
        error: "Parse API returned an HTML page instead of JSON. Check the snippet below for the reason:",
        htmlSnippet: rawText.substring(0, 500) // Shows the first 500 characters of the error page
      }, { status: 500 });
    }

    // Safely parse JSON if it's confirmed clean text
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
