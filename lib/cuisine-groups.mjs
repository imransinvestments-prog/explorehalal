/**
 * Canonical cuisine grouping.
 *
 * The raw `cuisine_type` values are free-text and extremely granular (hundreds
 * of near-unique labels like "Lebanese & Egyptian Charcoal Grills"). This maps
 * any of them to a small, sensible set of groups used for the search filter and
 * analytics. Shared by the Next.js app (imported from .ts/.tsx) and the Node
 * import/seed scripts (.mjs) so grouping stays consistent everywhere.
 *
 * Pure JavaScript with no dependencies so it is safe to import from both.
 */

/** Display order for the groups in the filter dropdown. */
export const CUISINE_GROUP_ORDER = [
  "South Asian",
  "Middle Eastern",
  "Turkish",
  "Persian & Afghan",
  "East & Southeast Asian",
  "American & Grills",
  "African & Caribbean",
  "European",
  "Café & Desserts",
  "Vegetarian & Vegan",
  "Butchers",
  "Newsagents",
  "Restaurant / Takeaway",
]

/** Fallback group for generic ("Restaurant/Takeaway") or unrecognised labels. */
export const DEFAULT_CUISINE_GROUP = "Restaurant / Takeaway"

const GROUP_SET = new Set(CUISINE_GROUP_ORDER)

/**
 * Ordered keyword rules. First group whose keywords appear in the (lowercased)
 * raw label wins, so more specific ethnic groups are checked before generic
 * "grill"/"asian" style keywords.
 */
const GROUP_RULES = [
  ["Butchers", ["butcher"]],
  [
    "Newsagents",
    [
      "newsagent", "news agent", "off licence", "off-licence", "off license",
      "corner shop", "convenience store", "convenience shop", "grocer",
    ],
  ],
  [
    "South Asian",
    [
      "pakistani", "indian", "bangladeshi", "punjabi", "lahori", "lahore",
      "karahi", "mughlai", "hyderabadi", "bombay", "mumbai", "desi", "balti",
      "biryani", "curry", "curries", "chaat", "chaii", "tandoori", "sri lankan",
      "south indian", "nepal", "gujarati", "kashmiri", "mirpuri", "chaii",
    ],
  ],
  ["Turkish", ["turkish", "ottoman", "anatolian", "mangal"]],
  ["Persian & Afghan", ["persian", "iranian", "irani", "afghan", "uzbek"]],
  [
    "Middle Eastern",
    [
      "lebanese", "syrian", "levantine", "levant", "palestinian", "egyptian",
      "arabian", "arabic", "middle eastern", "mediterranean", "shawarma",
      "meze", "mezze", "kurdish", "yemeni", "iraqi", "jordanian", "falafel",
    ],
  ],
  [
    "East & Southeast Asian",
    [
      "chinese", "japanese", "thai", "malaysian", "malay", "vietnamese",
      "korean", "dim sum", "ramen", "sushi", "pan-asian", "pan asian",
      "filipino", "indonesian", "asian",
    ],
  ],
  [
    "African & Caribbean",
    [
      "caribbean", "jamaican", "afro", "west african", "african", "nigerian",
      "eritrean", "ethiopian", "somali", "portuguese",
    ],
  ],
  [
    "American & Grills",
    [
      "burger", "bbq", "barbecue", "steak", "wings", "diner", "fried chicken",
      "grilled chicken", "smash", "american", "grill", "brisket", "new york",
      "fast food", "chicken",
    ],
  ],
  [
    "European",
    [
      "italian", "pasta", "pizza", "french", "british", "pies", "pie & mash",
      "pie and mash", "fish & chips", "fish and chips", "chippy", "gastropub",
      "irish",
    ],
  ],
  [
    "Café & Desserts",
    [
      "cafe", "café", "brunch", "crepe", "creperie", "dessert", "bakery",
      "patisserie", "coffee", "waffle", "gelato", "ice cream",
    ],
  ],
  ["Vegetarian & Vegan", ["vegan", "vegetarian"]],
]

/**
 * Map a raw cuisine label to its canonical group. Idempotent: passing a group
 * name back in returns the same group. Empty/nullish input returns the default.
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function groupCuisine(raw) {
  if (!raw) return DEFAULT_CUISINE_GROUP
  const trimmed = String(raw).trim()
  if (!trimmed) return DEFAULT_CUISINE_GROUP

  // Already a canonical group (e.g. re-grouping a logged filter value).
  if (GROUP_SET.has(trimmed)) return trimmed

  const haystack = trimmed.toLowerCase()
  for (const [group, keywords] of GROUP_RULES) {
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) return group
    }
  }
  return DEFAULT_CUISINE_GROUP
}

/** Canonical cuisine label used for venues identified as butchers. */
export const BUTCHER_CUISINE = "Butchers"

/** Canonical group for grocery/convenience venues (supermarkets, food stores). */
export const NEWSAGENT_CUISINE = "Newsagents"

/** Name keywords that mark a venue as a grocery/food store rather than a place to eat. */
const NEWSAGENT_NAME_KEYWORDS = ["supermarket", "foods"]

/**
 * A venue whose *name* contains "meat" is a butcher/meat shop regardless of its
 * raw cuisine label (e.g. "A1 Halal Meats" mislabelled as a takeaway).
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function nameImpliesButcher(name) {
  if (!name) return false
  return String(name).toLowerCase().includes("meat")
}

/**
 * A venue whose *name* contains "supermarket" or "foods" is a grocery/food
 * store, so it belongs under Newsagents regardless of its raw cuisine label.
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function nameImpliesNewsagent(name) {
  if (!name) return false
  const haystack = String(name).toLowerCase()
  return NEWSAGENT_NAME_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

/**
 * Apply name-based group overrides on top of an already-resolved group. Butcher
 * ("meat") takes priority over newsagent ("supermarket"/"foods"). This is the
 * single source of truth for name overrides, shared by import scripts and the
 * runtime display resolver so a venue's group is consistent everywhere.
 * @param {string | null | undefined} name
 * @param {string} group Base group derived from the cuisine label.
 * @returns {string}
 */
export function applyNameGroupOverride(name, group) {
  if (nameImpliesButcher(name)) return BUTCHER_CUISINE
  if (nameImpliesNewsagent(name)) return NEWSAGENT_CUISINE
  return group
}

/**
 * Resolve the effective cuisine_type + cuisine_group for a record, applying
 * name-based overrides. A venue whose name contains "meat" is forced to
 * Butchers; one containing "supermarket"/"foods" is forced to Newsagents.
 * Shared by every import path so the rule is applied consistently.
 * @param {{ name?: string | null, cuisineType?: string | null }} input
 * @returns {{ cuisineType: string, cuisineGroup: string }}
 */
export function resolveCuisine({ name, cuisineType }) {
  if (nameImpliesButcher(name)) {
    return { cuisineType: BUTCHER_CUISINE, cuisineGroup: BUTCHER_CUISINE }
  }
  const type =
    cuisineType && String(cuisineType).trim()
      ? String(cuisineType).trim()
      : "Restaurant/Takeaway"
  return { cuisineType: type, cuisineGroup: applyNameGroupOverride(name, groupCuisine(type)) }
}
