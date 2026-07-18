import { resolveMarketLocation, searchListings } from "../src/services/search.js";

const location = resolveMarketLocation("jt");
if (location?.location !== "Johar Town") {
  throw new Error(`Expected jt to resolve to Johar Town, got ${location?.location ?? "null"}`);
}

const matches = searchListings({
  purpose: "rent",
  property_type: "commercial",
  location: "jt",
  budget_pkr: 500000,
});

if (matches[0]?.location !== "Johar Town") {
  throw new Error("Expected first demo search match to be in Johar Town");
}

const noFalsePositives = searchListings({
  purpose: "buy",
  property_type: "house",
  location: "DHA Phase 6",
  budget_pkr: 20000000,
  bedrooms: 3,
});

if (noFalsePositives.length !== 0) {
  throw new Error("Expected strict filters to reject over-budget or wrong-location listings");
}

console.log("Search smoke test passed.");
