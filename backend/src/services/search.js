export const DEMO_LISTINGS = [
  {
    id: "demo-jt-commercial-rent-1",
    title: "10 marla commercial unit near Johar Town main boulevard",
    purpose: "rent",
    property_type: "commercial",
    location: "Johar Town",
    budget_pkr: 450000,
    size: "10 marla",
  },
  {
    id: "demo-jt-apartment-rent-1",
    title: "2 bed apartment in Johar Town",
    purpose: "rent",
    property_type: "apartment",
    location: "Johar Town",
    budget_pkr: 95000,
    bedrooms: 2,
    size: "950 sq ft",
  },
  {
    id: "demo-dha6-house-buy-1",
    title: "1 kanal house in DHA Phase 6",
    purpose: "buy",
    property_type: "house",
    location: "DHA Phase 6",
    budget_pkr: 145000000,
    bedrooms: 5,
    size: "1 kanal",
  },
  {
    id: "demo-bahria-sector-c-plot-1",
    title: "5 marla plot in Bahria Town Sector C",
    purpose: "buy",
    property_type: "plot",
    location: "Bahria Town Sector C",
    budget_pkr: 8500000,
    size: "5 marla",
  },
  {
    id: "demo-gulberg-greens-commercial-1",
    title: "Commercial office space in Gulberg Greens",
    purpose: "rent",
    property_type: "commercial",
    location: "Gulberg Greens",
    budget_pkr: 300000,
    size: "1800 sq ft",
  },
  {
    id: "demo-model-town-house-rent-1",
    title: "4 bed house in Model Town",
    purpose: "rent",
    property_type: "house",
    location: "Model Town",
    budget_pkr: 275000,
    bedrooms: 4,
    size: "12 marla",
  },
  {
    id: "demo-scheme33-apartment-buy-1",
    title: "3 bed apartment in Scheme 33",
    purpose: "buy",
    property_type: "apartment",
    location: "Scheme 33",
    budget_pkr: 18500000,
    bedrooms: 3,
    size: "1450 sq ft",
  },
];

const GENERIC_LOCATION_WORDS = new Set([
  "area",
  "authority",
  "block",
  "city",
  "housing",
  "phase",
  "road",
  "sector",
  "society",
  "town",
]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  return normalize(value)
    .split(" ")
    .filter((token) => token && !GENERIC_LOCATION_WORDS.has(token));
}

function initials(value) {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0])
    .join("");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function locationVocabulary(listings = DEMO_LISTINGS) {
  const locations = unique(listings.map((listing) => listing.location));
  return locations.map((location) => {
    const tokens = significantTokens(location);
    const generatedAliases = unique([
      normalize(location),
      initials(location),
      tokens.join(" "),
      ...tokens,
      normalize(location).replace(/\bphase\s+(\d+)\b/g, "ph $1"),
      normalize(location).replace(/\bsector\s+([a-z0-9]+)\b/g, "sec $1"),
    ]);

    return { location, aliases: generatedAliases };
  });
}

function scoreAlias(query, alias) {
  if (!query || !alias) return 0;
  if (query === alias) return 1;
  if (alias.length > 2 && query.includes(alias)) return 0.92;
  if (query.length > 2 && alias.includes(query)) return 0.85;

  const queryTokens = query.split(" ");
  const aliasTokens = alias.split(" ");
  const sharedTokens = queryTokens.filter((token) => aliasTokens.includes(token));
  if (sharedTokens.length > 0) {
    return sharedTokens.length / Math.max(queryTokens.length, aliasTokens.length);
  }

  return 0;
}

function enrichPhaseSector(query, resolvedLocation) {
  const phase = query.match(/\b(?:phase|ph)\s*(\d+)\b/);
  if (phase && /\bdha\b/.test(normalize(resolvedLocation))) return `DHA Phase ${phase[1]}`;

  const sector = query.match(/\b(?:sector|sec)\s*([a-z0-9]+)\b/);
  if (sector && /\bbahria\b/.test(normalize(resolvedLocation))) {
    return `Bahria Town Sector ${sector[1].toUpperCase()}`;
  }

  const block = query.match(/\b(?:block|blk)\s*([a-z])\b/);
  if (block) return `${resolvedLocation} Block ${block[1].toUpperCase()}`;

  return resolvedLocation;
}

export function resolveMarketLocation(input, listings = DEMO_LISTINGS) {
  const query = normalize(input);
  if (!query) return null;

  const scored = locationVocabulary(listings)
    .map((entry) => {
      const score = Math.max(...entry.aliases.map((alias) => scoreAlias(query, alias)));
      return { ...entry, score };
    })
    .filter((entry) => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  return {
    location: enrichPhaseSector(query, best.location),
    confidence: best.score,
    candidates: scored.slice(0, 3).map((entry) => ({
      location: entry.location,
      confidence: entry.score,
    })),
  };
}

function withinBudget(listingBudget, targetBudget) {
  if (!targetBudget) return true;
  if (!listingBudget) return true;
  return listingBudget <= targetBudget * 1.1;
}

export function searchListings(fields, listings = DEMO_LISTINGS, limit = 3) {
  const resolvedLocation = fields.location ? resolveMarketLocation(fields.location, listings) : null;
  const location = resolvedLocation?.location ?? fields.location;

  return listings
    .map((listing) => {
      let score = 0;
      if (fields.purpose && listing.purpose === fields.purpose) score += 25;
      if (fields.property_type && listing.property_type === fields.property_type) score += 25;
      if (location && normalize(listing.location).includes(normalize(location).split(" ")[0])) score += 25;
      if (withinBudget(listing.budget_pkr, fields.budget_pkr)) score += 15;
      if (fields.bedrooms && listing.bedrooms === fields.bedrooms) score += 10;
      return { ...listing, match_score: score };
    })
    .filter((listing) => listing.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

export async function searchListingsForLead(fields, { limit = 3, useDemoFallback = true } = {}) {
  let listings = DEMO_LISTINGS;
  let source = "demo";

  try {
    const { getActiveListings } = await import("../db.js");
    const dbListings = await getActiveListings();
    if (dbListings.length > 0) {
      listings = dbListings;
      source = "supabase";
    }
  } catch (err) {
    if (!useDemoFallback) throw err;
    console.warn("[search] Falling back to demo listings", { message: err.message });
  }

  return {
    source,
    matches: searchListings(fields, listings, limit),
  };
}

export function marketContextSummary(listings = DEMO_LISTINGS) {
  return locationVocabulary(listings)
    .map((entry) => `${entry.location} [generated aliases: ${entry.aliases.slice(0, 4).join(", ")}]`)
    .join("; ");
}
