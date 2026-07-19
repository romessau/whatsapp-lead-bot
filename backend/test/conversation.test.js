import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_FIELDS, FIELD_KEYS, findNextQuestion } from "../src/config/questions.js";
import { ExtractionResultSchema } from "../src/services/extraction.js";
import { notifyAgent } from "../src/services/handoff.js";
import { scoreLead } from "../src/services/scoring.js";
import { mergeFields } from "../src/services/stateMachine.js";

test("the qualification flow represents every stored requirement", () => {
  assert.deepEqual(FIELD_KEYS, [
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
  ]);
});

test("a multi-field turn advances to the first genuinely missing question", () => {
  const fields = mergeFields(EMPTY_FIELDS, {
    purpose: "buy",
    location: "DHA Phase 6 Lahore",
    budget_pkr: 20_000_000,
    property_type: "house",
    bedrooms: 3,
  });

  assert.equal(findNextQuestion(fields)?.key, "timeline");
});

test("explicit corrections overwrite previous information", () => {
  const before = { ...EMPTY_FIELDS, property_type: "apartment", budget_pkr: 15_000_000 };
  const after = mergeFields(before, { property_type: "house", budget_pkr: 20_000_000 });

  assert.equal(after.property_type, "house");
  assert.equal(after.budget_pkr, 20_000_000);
});

test("lead scoring remains deterministic", () => {
  assert.deepEqual(
    scoreLead({
      budget_pkr: 20_000_000,
      location: "DHA Lahore",
      timeline: "urgent",
      purpose: "buy",
      name: "Ayesha",
      phone: "+923001234567",
      wants_call: true,
    }),
    { score: 100, classification: "Hot" }
  );
});

test("model output schema rejects invented enum values", () => {
  const valid = {
    intent: "on_topic",
    mentioned_fields: ["purpose"],
    purpose: "buy",
    location: null,
    budget_pkr: null,
    property_type: null,
    bedrooms: null,
    size: null,
    timeline: null,
    name: null,
    phone: null,
    wants_call: null,
  };

  assert.equal(ExtractionResultSchema.safeParse(valid).success, true);
  assert.equal(ExtractionResultSchema.safeParse({ ...valid, property_type: "farmhouse" }).success, false);
});

test("an n8n acknowledgement without delivery confirmation falls through to email", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalEnv = {
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    AGENT_EMAIL: process.env.AGENT_EMAIL,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    AGENT_WHATSAPP_TO: process.env.AGENT_WHATSAPP_TO,
  };
  const calls = [];

  process.env.N8N_WEBHOOK_URL = "https://n8n.test/webhook";
  process.env.RESEND_API_KEY = "test-key";
  process.env.AGENT_EMAIL = "agent@example.com";
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.AGENT_WHATSAPP_TO;
  console.error = () => {};
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) {
      return new Response(JSON.stringify({ accepted: true, notified: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    await notifyAgent("summary", { classification: "Warm", location: "Lahore" });
    assert.deepEqual(calls.sort(), ["https://api.resend.com/emails", "https://n8n.test/webhook"]);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
