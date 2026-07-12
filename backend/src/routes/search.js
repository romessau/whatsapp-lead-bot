import { Router } from "express";
import { EMPTY_FIELDS, FIELD_KEYS } from "../config/questions.js";
import { extractFields } from "../services/extraction.js";
import { resolveMarketLocation, searchListingsForLead } from "../services/search.js";

export const searchRouter = Router();

function cleanFields(input = {}) {
  return FIELD_KEYS.reduce((acc, key) => {
    acc[key] = input[key] ?? null;
    return acc;
  }, {});
}

function hasAnyField(fields) {
  return FIELD_KEYS.some((key) => fields[key] !== null && fields[key] !== undefined && fields[key] !== "");
}

searchRouter.post("/", async (req, res) => {
  try {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const providedFields = cleanFields(req.body?.fields ?? {});

    if (!query && !hasAnyField(providedFields)) {
      return res.status(400).json({ error: "query or fields are required" });
    }

    let extracted = { intent: "on_topic", fields: { ...EMPTY_FIELDS } };
    if (query) {
      extracted = await extractFields(query, {
        mode: "listing_search",
        current_question: null,
        collected_fields: providedFields,
        skipped_fields: {},
      });
    }

    const fields = { ...providedFields };
    for (const key of FIELD_KEYS) {
      if ((fields[key] === null || fields[key] === undefined || fields[key] === "") && extracted.fields[key] !== null) {
        fields[key] = extracted.fields[key];
      }
    }

    const resolvedLocation = fields.location ? resolveMarketLocation(fields.location) : null;
    if (resolvedLocation) fields.location = resolvedLocation.location;

    const results = await searchListingsForLead(fields, { limit: 5 });

    return res.json({
      query: query || null,
      intent: extracted.intent,
      fields,
      location: resolvedLocation,
      source: results.source,
      matches: results.matches,
    });
  } catch (err) {
    console.error("[search] Failed to process search request", {
      message: err.message,
      query: req.body?.query,
    });
    return res.status(500).json({ error: "Failed to search listings" });
  }
});
