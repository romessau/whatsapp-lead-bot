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

console.log("Search smoke test passed.");
