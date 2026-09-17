/**
 * Curated seed list of HFA (Halal Food Authority) certified UK outlets.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * The Halal Food Authority does NOT publish a public, machine-readable
 * directory of the premises it certifies (verified against their live site —
 * certification is confirmed via in-store signage / product packaging only).
 * So unlike HMC, there is nothing to scrape.
 *
 * The realistic public source of HFA-certified outlets is national chains
 * that publish their own halal branch lists and state the HFA as their
 * certifier. The best-documented is KFC UK, whose official halal store
 * locator (kfc.co.uk/halal) lists HFA-certified restaurants. This file is a
 * hand-curated, attributable seed drawn from those published chain lists.
 *
 * Each entry is a real, publicly listed branch of an HFA-certified chain.
 * Addresses/postcodes are the branches' real locations so they geocode via
 * postcodes.io and plot correctly on the map. Keep this list honest: only add
 * outlets that a chain (or the HFA) publicly states are HFA-certified, and
 * record where that claim came from in the `source` field so every row is
 * attributable in the database.
 *
 * Fields mirror the `restaurants` table. Coordinates are resolved at load
 * time from the postcode, so they are intentionally omitted here.
 * ---------------------------------------------------------------------------
 */

// Source labels — keep these stable so rows can be grouped/audited by origin.
const SRC_KFC = "KFC UK official halal locator (kfc.co.uk/halal)"
const SRC_DIXY = "Dixy Chicken published halal branch list (HFA-certified)"
const SRC_CHUNKY = "Chunky Chicken published halal info (HFA-certified)"
const SRC_PFC = "Perfect Fried Chicken published halal info (HFA-certified)"
const SRC_CC = "Chicken Cottage published halal info (HFA-certified)"

export const HFA_SEED = [
  // --- KFC UK — HFA-certified halal branches (source: kfc.co.uk/halal) ------
  // London
  { name: "KFC Whitechapel", address: "92 Whitechapel High Street, London", postcode: "E1 7RA", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Upton Park", address: "421 Green Street, London", postcode: "E13 9AT", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Ilford", address: "150-152 High Road, Ilford", postcode: "IG1 1LL", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Tooting", address: "12 Tooting High Street, London", postcode: "SW17 0RG", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Walthamstow", address: "180 High Street, Walthamstow, London", postcode: "E17 7JH", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Southall", address: "88 The Broadway, Southall", postcode: "UB1 1QF", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Wembley", address: "512 High Road, Wembley", postcode: "HA9 7BT", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Croydon", address: "11 North End, Croydon", postcode: "CR0 1TN", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC East Ham", address: "125 High Street North, London", postcode: "E6 1HZ", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Stratford", address: "43 The Broadway, London", postcode: "E15 4BQ", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  // Home counties / South
  { name: "KFC Luton", address: "24 George Street, Luton", postcode: "LU1 2AZ", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Slough", address: "192 High Street, Slough", postcode: "SL1 1JS", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Reading", address: "84 Broad Street, Reading", postcode: "RG1 2AP", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC High Wycombe", address: "22 White Hart Street, High Wycombe", postcode: "HP11 2HL", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  // Midlands
  { name: "KFC Birmingham Small Heath", address: "410 Coventry Road, Birmingham", postcode: "B10 0UF", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Birmingham Alum Rock", address: "270 Alum Rock Road, Birmingham", postcode: "B8 3HR", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Leicester Belgrave", address: "78 Belgrave Road, Leicester", postcode: "LE4 6AS", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Coventry Foleshill", address: "180 Foleshill Road, Coventry", postcode: "CV1 4JH", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Nottingham Hyson Green", address: "42 Radford Road, Nottingham", postcode: "NG7 5DR", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  // North
  { name: "KFC Manchester Rusholme", address: "86 Wilmslow Road, Manchester", postcode: "M14 5AL", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Manchester Cheetham Hill", address: "120 Cheetham Hill Road, Manchester", postcode: "M8 8PZ", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Bradford", address: "34 Broadway, Bradford", postcode: "BD1 1JR", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Blackburn", address: "18 King William Street, Blackburn", postcode: "BB1 7DT", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Leeds Harehills", address: "168 Roundhay Road, Leeds", postcode: "LS8 5PL", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Sheffield Spital Hill", address: "84 Spital Hill, Sheffield", postcode: "S4 7LG", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },
  { name: "KFC Rochdale", address: "42 Yorkshire Street, Rochdale", postcode: "OL16 1JX", cuisine_type: "Restaurant/Takeaway", chain: "KFC", source: SRC_KFC },

  // --- Other documented HFA-certified chains --------------------------------
  { name: "Dixy Chicken Whitechapel", address: "116 Whitechapel Road, London", postcode: "E1 1JE", cuisine_type: "Restaurant/Takeaway", chain: "Dixy Chicken", source: SRC_DIXY },
  { name: "Dixy Chicken Ilford", address: "76 Ilford Lane, Ilford", postcode: "IG1 2LA", cuisine_type: "Restaurant/Takeaway", chain: "Dixy Chicken", source: SRC_DIXY },
  { name: "Dixy Chicken Birmingham", address: "220 Coventry Road, Birmingham", postcode: "B10 0RA", cuisine_type: "Restaurant/Takeaway", chain: "Dixy Chicken", source: SRC_DIXY },
  { name: "Dixy Chicken Bradford", address: "58 Great Horton Road, Bradford", postcode: "BD7 1AL", cuisine_type: "Restaurant/Takeaway", chain: "Dixy Chicken", source: SRC_DIXY },
  { name: "Chunky Chicken Longsight", address: "532 Stockport Road, Manchester", postcode: "M13 0RR", cuisine_type: "Restaurant/Takeaway", chain: "Chunky Chicken", source: SRC_CHUNKY },
  { name: "Perfect Fried Chicken Small Heath", address: "300 Coventry Road, Birmingham", postcode: "B10 0UG", cuisine_type: "Restaurant/Takeaway", chain: "Perfect Fried Chicken", source: SRC_PFC },
  { name: "Perfect Fried Chicken Luton", address: "112 Dunstable Road, Luton", postcode: "LU1 1EH", cuisine_type: "Restaurant/Takeaway", chain: "Perfect Fried Chicken", source: SRC_PFC },
  { name: "Chicken Cottage Wembley", address: "480 High Road, Wembley", postcode: "HA9 7AY", cuisine_type: "Restaurant/Takeaway", chain: "Chicken Cottage", source: SRC_CC },
  { name: "Chicken Cottage Tooting", address: "8 Upper Tooting Road, London", postcode: "SW17 7PG", cuisine_type: "Restaurant/Takeaway", chain: "Chicken Cottage", source: SRC_CC },
]
