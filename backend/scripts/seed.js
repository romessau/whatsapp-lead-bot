import "dotenv/config";
import { deleteSession } from "../src/db.js";

// Usage: npm run seed:reset -- +923001234567
// Or set DEMO_PHONE in your .env and run: npm run seed:reset
const phone = process.argv[2] || process.env.DEMO_PHONE;

if (!phone) {
  console.error(
    "Usage: npm run seed:reset -- <phone-or-session-id>\n(or set DEMO_PHONE in backend/.env)"
  );
  process.exit(1);
}

try {
  await deleteSession(phone);
  console.log(`Session for "${phone}" reset. Next message will start the flow from question 1.`);
} catch (err) {
  console.error("Failed to reset session:", err.message);
  process.exit(1);
}
