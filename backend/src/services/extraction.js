import "dotenv/config";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { OPENAI_MODEL } from "../config/app.js";
import { marketContextSummary, resolveMarketLocation } from "./search.js";

let openai;

function getOpenAIClient() {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const SCHEMA_KEYS = [
  "purpose",
  "location",
  "budget_pkr",
  "property_type",
  "bedrooms",
  "size",
  "timeline",
  "name",
  "phone",
  "wants_call",
];

const LeadFieldKeySchema = z.enum(SCHEMA_KEYS);
const NullableString = z.string().nullable();

export const ExtractionResultSchema = z.object({
  intent: z.enum(["on_topic", "uncertain", "off_topic", "exit"]),
  mentioned_fields: z.array(LeadFieldKeySchema),
  purpose: z.enum(["buy", "rent", "invest"]).nullable(),
  location: NullableString,
  budget_pkr: z.number().nonnegative().nullable(),
  property_type: z.enum(["plot", "house", "apartment", "commercial"]).nullable(),
  bedrooms: z.number().int().nonnegative().nullable(),
  size: NullableString,
  timeline: z.enum(["urgent", "this_month", "3_months", "exploring"]).nullable(),
  name: NullableString,
  phone: NullableString,
  wants_call: z.boolean().nullable(),
});

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured real-estate lead information from one user message. Messages may be in English, Urdu script, or Roman Urdu.

Classify intent relative to the pending question:
- on_topic: the message contains property requirements or a usable answer.
- uncertain: the user does not know, wants guidance, or wants to skip.
- exit: the user wants to end the conversation or stop being contacted.
- off_topic: the message is unrelated and is not an attempt to exit.

Extraction rules:
- Extract every fact explicitly stated in this message, including corrections to earlier facts.
- Leave facts not stated in this message as null. Never copy collected_fields into the extracted result.
- mentioned_fields must list only fields stated or clearly expressed in this message.
- A clear desire to acquire a property can imply purpose=buy even when the word buy is omitted.
- wants_call must be null unless the message explicitly accepts or declines an agent call.
- Convert crore/cr/karor and lakh/lac/lacs to full PKR numbers.
- Treat marla, kanal, square feet, gaz/yards, plot files, phases, sectors, and blocks as real-estate signals.
- Map ghar/makaan/kothi/bungalow to house; flat to apartment; dukan/shop/office/plaza to commercial.
- Normalize timelines to urgent, this_month, 3_months, or exploring.
- Do not choose the next question and do not write a user-facing reply. Application code owns routing.

Examples:
- "Mera budget 2 crore hai, DHA Phase 6 mein 3 bed ghar chahiye" => mentioned_fields=[purpose,location,budget_pkr,property_type,bedrooms], purpose=buy, location="DHA Phase 6", budget_pkr=20000000, property_type=house, bedrooms=3.
- "Actually apartment nahi, house chahiye" => mentioned_fields=[property_type], property_type=house.
- "I don't know the area, guide me" => intent=uncertain, mentioned_fields=[].
- "Stop messaging me" => intent=exit, mentioned_fields=[].`;

function hasValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function parsePakBudget(message) {
  const normalized = message.toLowerCase().replace(/,/g, "");
  const crore = normalized.match(/\b(\d+(?:\.\d+)?)\s*(crore|cr|karor)\b/);
  if (crore) return Math.round(Number(crore[1]) * 10_000_000);

  const lakh = normalized.match(/\b(\d+(?:\.\d+)?)\s*(lakh|lac|lacs)\b/);
  if (lakh) return Math.round(Number(lakh[1]) * 100_000);

  return null;
}

function applyPakMarketFallbacks(message, fields) {
  const normalized = message.toLowerCase();
  const next = { ...fields };

  if (!hasValue(next.location)) {
    const resolvedLocation = resolveMarketLocation(message);
    if (resolvedLocation) next.location = resolvedLocation.location;
  }

  if (!hasValue(next.budget_pkr)) {
    const budget = parsePakBudget(message);
    if (budget !== null) next.budget_pkr = budget;
  }

  if (!hasValue(next.size)) {
    const size = message.match(
      /\b(\d+(?:\.\d+)?)\s*(marla|kanal|sq\.?\s*ft|square\s*feet|gaz|yards?|sq\.?\s*yd)\b/i
    );
    if (size) next.size = `${size[1]} ${size[2].replace(/\s+/g, " ").toLowerCase()}`;
  }

  if (!hasValue(next.bedrooms)) {
    const bedrooms = normalized.match(/\b(\d+)\s*(bed|beds|bedroom|bedrooms)\b/);
    if (bedrooms) next.bedrooms = Number(bedrooms[1]);
  }

  if (!hasValue(next.property_type)) {
    if (/\b(ghar|makaan|kothi|bungalow|house)\b/.test(normalized)) next.property_type = "house";
    else if (/\b(flat|apartment)\b/.test(normalized)) next.property_type = "apartment";
    else if (/\b(dukan|shop|office|plaza|commercial)\b/.test(normalized)) next.property_type = "commercial";
    else if (/\b(plot|file|plot file)\b/.test(normalized)) next.property_type = "plot";
  }

  if (!hasValue(next.purpose)) {
    if (/\b(rent|rental|kiraya|karaya)\b/.test(normalized)) next.purpose = "rent";
    else if (/\b(buy|purchase|khareed|kharid)\b/.test(normalized)) next.purpose = "buy";
    else if (/\b(invest|investment|investor)\b/.test(normalized)) next.purpose = "invest";
  }

  if (!hasValue(next.timeline)) {
    if (/\b(urgent|asap|jaldi|for this week|today|tomorrow)\b/.test(normalized)) next.timeline = "urgent";
    else if (/\b(this month|within a month|is mahine|mahine ke andar)\b/.test(normalized)) {
      next.timeline = "this_month";
    } else if (/\b(3 months|three months|quarter)\b/.test(normalized)) {
      next.timeline = "3_months";
    } else if (/\b(exploring|dekh raha|dekh rahi|just checking|browse)\b/.test(normalized)) {
      next.timeline = "exploring";
    }
  }

  return next;
}

export async function extractFields(userMessage, context = {}) {
  const completion = await getOpenAIClient().chat.completions.parse({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          user_message: userMessage,
          conversation_context: context,
          market_search_context: marketContextSummary(),
        }),
      },
    ],
    response_format: zodResponseFormat(ExtractionResultSchema, "lead_message"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    console.error("[extraction] Model returned no parsed result", { model: OPENAI_MODEL });
    return { intent: "off_topic", fields: applyPakMarketFallbacks(userMessage, {}) };
  }

  const mentionedFields = new Set(parsed.mentioned_fields);
  const fields = {};
  for (const key of SCHEMA_KEYS) {
    const value = parsed[key];
    if (mentionedFields.has(key) && hasValue(value)) fields[key] = value;
  }

  return {
    intent: parsed.intent,
    fields: applyPakMarketFallbacks(userMessage, fields),
  };
}
