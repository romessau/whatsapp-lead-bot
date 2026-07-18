import "dotenv/config";
import OpenAI from "openai";
import { OPENAI_MODEL } from "../config/app.js";
import { marketContextSummary, resolveMarketLocation } from "./search.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INTENTS = ["on_topic", "uncertain", "off_topic", "exit"];
const PURPOSES = ["buy", "rent", "invest"];
const PROPERTY_TYPES = ["plot", "house", "apartment", "commercial"];
const TIMELINES = ["urgent", "this_month", "3_months", "exploring"];
const NEXT_QUESTIONS = [
  "location",
  "budget_pkr",
  "property_type",
  "bedrooms",
  "timeline",
  "name",
  "phone",
  "wants_call",
  "confirm_close",
];

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured real estate lead information and classify the user's intent. Messages may be in English, Urdu, or Roman Urdu.

Return ONLY valid JSON, no other text, matching this schema:
{
  "intent": "on_topic" | "uncertain" | "off_topic" | "exit",
  "fields": {
    "purpose": "buy" | "rent" | "invest" | null,
    "location": string | null,
    "budget_pkr": number | null,
    "property_type": "plot" | "house" | "apartment" | "commercial" | null,
    "bedrooms": number | null,
    "size": string | null,
    "timeline": "urgent" | "this_month" | "3_months" | "exploring" | null,
    "name": string | null,
    "phone": string | null,
    "wants_call": boolean | null
  },
  "next_question": "location" | "budget_pkr" | "property_type" | "bedrooms" | "timeline" | "name" | "phone" | "wants_call" | "confirm_close" | null,
  "next_question_prompt": string | null
}

Intent rules:
- on_topic: the message contains real estate requirements or an answer to the current lead questions.
  Examples: "urgent", "DHA phase 6, budget 2 crore", "yes call me", "rent apartment".
- uncertain: the user is unclear, unsure, or gives a bare non-answer without ending the chat.
  Examples: "not sure", "idk", "maybe", "skip".
- off_topic: jokes, small talk, unrelated questions, or irrelevant asides with no usable lead details.
  Examples: "tell me a joke", "who won the match?", "haha thanks".
- exit: the user wants to stop, is not interested, says goodbye, or refuses the conversation.
  Examples: "bye", "not interested", "stop messaging me", "cancel".

Field rules:
- Only fill fields explicitly stated or clearly implied. Leave everything else null.
- If a message mixes irrelevant content with a real answer, still extract the real answer and use intent "on_topic".
- Use the conversation context. If the current question accepts a field and the user gives a short answer, map it to that field when reasonable.
- Pakistani market vocabulary:
  - Convert "crore/cr/karor" and "lakh/lac/lacs" into full PKR numbers (1 crore = 10,000,000; 1 lakh = 100,000).
  - Treat "marla", "kanal", "sq ft", "square feet", "gaz", "yard", "file", "possession", "corner", "park facing", "phase", "sector", and "block" as real estate signals, not noise.
  - "10 marla", "1 kanal", "5 marla", "120 sq yd", etc. are size values.
  - DHA phases, Bahria sectors, Gulberg blocks, Johar Town, Askari, Wapda Town, Model Town, Fazaia, Citi Housing, and similar locality names are locations.
  - Short locality abbreviations can be real answers. Use the market/search context to infer them when confidence is high.
  - "ghar", "makaan", "kothi", "bungalow" map to house; "flat" maps to apartment; "dukan", "shop", "office", "plaza" map to commercial.
- Map "soon/asap/for this week" to "urgent"; "within a month" to "this_month"; "3 months/quarter" to "3_months".
- Do not guess a name or phone number from context. Only extract them if literally provided.
- "yes" or "call me" can mean wants_call true. "no call" can mean wants_call false.
- If the user is annoyed, swears, jokes, or adds random text but still gives a usable property detail, extract the useful detail and use intent "on_topic".
- If the user swears and clearly wants to stop, use intent "exit".
- Choose next_question like a helpful property assistant, not a rigid form:
  - Ask for the single most useful missing detail after considering collected_fields and this message.
  - Do not ask for a field that is already answered in collected_fields or fields.
  - If enough qualification details are available and only handoff confirmation remains, use "confirm_close".
  - Use null only when the conversation should end, the user is exiting, or you are genuinely unsure.
  - next_question_prompt should be a short, natural question in the user's language when you can phrase it better for context; otherwise null.
- Do not include any explanation, markdown, or text outside the JSON object.`;

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

function sanitizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeInteger(value) {
  const number = sanitizeNumber(value);
  return number === null ? null : Math.trunc(number);
}

function sanitizeEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function sanitizeFields(parsedFields = {}) {
  const fields = {};
  for (const key of SCHEMA_KEYS) fields[key] = null;

  fields.purpose = sanitizeEnum(parsedFields.purpose, PURPOSES);
  fields.location = sanitizeString(parsedFields.location);
  fields.budget_pkr = sanitizeNumber(parsedFields.budget_pkr);
  fields.property_type = sanitizeEnum(parsedFields.property_type, PROPERTY_TYPES);
  fields.bedrooms = sanitizeInteger(parsedFields.bedrooms);
  fields.size = sanitizeString(parsedFields.size);
  fields.timeline = sanitizeEnum(parsedFields.timeline, TIMELINES);
  fields.name = sanitizeString(parsedFields.name);
  fields.phone = sanitizeString(parsedFields.phone);
  fields.wants_call = typeof parsedFields.wants_call === "boolean" ? parsedFields.wants_call : null;

  return fields;
}

function sanitizeNextQuestion(value) {
  return NEXT_QUESTIONS.includes(value) ? value : null;
}

function parsePakBudget(message) {
  const normalized = message.toLowerCase().replace(/,/g, "");
  const crore = normalized.match(/\b(\d+(?:\.\d+)?)\s*(crore|cr|karor)\b/);
  if (crore) return Math.round(Number(crore[1]) * 10000000);

  const lakh = normalized.match(/\b(\d+(?:\.\d+)?)\s*(lakh|lac|lacs)\b/);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);

  return null;
}

function applyPakMarketFallbacks(message, fields) {
  const normalized = message.toLowerCase();
  const next = { ...fields };

  if (next.location === null) {
    const resolvedLocation = resolveMarketLocation(message);
    if (resolvedLocation) next.location = resolvedLocation.location;
  }

  if (next.budget_pkr === null) {
    const budget = parsePakBudget(message);
    if (budget !== null) next.budget_pkr = budget;
  }

  if (next.size === null) {
    const size = message.match(
      /\b(\d+(?:\.\d+)?)\s*(marla|kanal|sq\.?\s*ft|square\s*feet|gaz|yards?|sq\.?\s*yd)\b/i
    );
    if (size) next.size = `${size[1]} ${size[2].replace(/\s+/g, " ").toLowerCase()}`;
  }

  if (next.bedrooms === null) {
    const bedrooms = normalized.match(/\b(\d+)\s*(bed|beds|bedroom|bedrooms)\b/);
    if (bedrooms) next.bedrooms = Number(bedrooms[1]);
  }

  if (next.property_type === null) {
    if (/\b(ghar|makaan|kothi|bungalow|house)\b/.test(normalized)) next.property_type = "house";
    else if (/\b(flat|apartment)\b/.test(normalized)) next.property_type = "apartment";
    else if (/\b(dukan|shop|office|plaza|commercial)\b/.test(normalized)) next.property_type = "commercial";
    else if (/\b(plot|file|plot file)\b/.test(normalized)) next.property_type = "plot";
  }

  if (next.purpose === null) {
    if (/\b(rent|rental|kiraya|karaya)\b/.test(normalized)) next.purpose = "rent";
    else if (/\b(buy|purchase|khareed|kharid)\b/.test(normalized)) next.purpose = "buy";
    else if (/\b(invest|investment|investor)\b/.test(normalized)) next.purpose = "invest";
  }

  if (next.timeline === null) {
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

/**
 * Calls the LLM once against the raw user message and returns sanitized
 * extraction + intent classification. The LLM never decides the next route
 * and never computes the score.
 */
export async function extractFields(userMessage, context = {}) {
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
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
      response_format: { type: "json_object" },
    });
  } catch (err) {
    console.error("[extraction] OpenAI extraction call failed", {
      model: OPENAI_MODEL,
      message: err.message,
      status: err.status,
      code: err.code,
    });
    throw err;
  }

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[extraction] Failed to parse LLM output as JSON", {
      model: OPENAI_MODEL,
      raw,
      message: err.message,
    });
    return {
      intent: "uncertain",
      fields: applyPakMarketFallbacks(userMessage, sanitizeFields()),
      next_question: null,
      next_question_prompt: null,
    };
  }

  const nextQuestionPrompt = sanitizeString(parsed.next_question_prompt);

  return {
    intent: INTENTS.includes(parsed.intent) ? parsed.intent : "uncertain",
    fields: applyPakMarketFallbacks(userMessage, sanitizeFields(parsed.fields ?? parsed)),
    next_question: sanitizeNextQuestion(parsed.next_question),
    next_question_prompt: nextQuestionPrompt,
  };
}
