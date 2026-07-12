import "dotenv/config";
import { replaceDemoListings } from "../src/db.js";
import { DEMO_LISTINGS } from "../src/services/search.js";

try {
  const rows = await replaceDemoListings(DEMO_LISTINGS);
  console.log(`Seeded ${rows.length} demo listings.`);
} catch (err) {
  console.error("Failed to seed demo listings:", err.message);
  process.exit(1);
}
