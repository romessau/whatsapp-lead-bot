import {
  CRITICAL_FIELDS,
  DEFAULT_LANGUAGE,
  EMPTY_FIELDS,
  FIELD_KEYS,
  SUPPORTED_LANGUAGES,
  findNextQuestion,
  getAcceptedFields,
  getCopy,
  getQuestionPrompt,
} from "../config/questions.js";
import { MAX_CONFIRMATION_HOLDS } from "../config/app.js";
import { getOrCreateSession, saveLead, saveSession } from "../db.js";
import { extractFields } from "./extraction.js";
import { buildHandoffSummary, notifyAgent } from "./handoff.js";
import { scoreLead } from "./scoring.js";
import { searchListingsForLead } from "./search.js";

const SKIP_RE = /\b(skip|not sure|idk|i don't know|dont know|no idea|pata nahi|maloom nahi)\b/i;
const CONFIRM_RE = /\b(yes|yep|yeah|sure|ok|okay|confirm|save|send|done|han|haan|theek|kar dein)\b/i;
const HOLD_RE = /\b(no|not yet|later|hold|wait|maybe later|abhi nahi|ruk|nahi)\b/i;
const EARLY_EXIT_RE = /\b(bye|goodbye|not interested|stop|cancel|no thanks|unsubscribe|bas|band)\b/i;

function hasValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function hasAnyUsefulField(fields) {
  return FIELD_KEYS.some((key) => hasValue(fields[key]));
}

function filterSkipped(skipped = {}) {
  return FIELD_KEYS.reduce((acc, key) => {
    if (skipped[key] === true && !CRITICAL_FIELDS.includes(key)) acc[key] = true;
    return acc;
  }, {});
}

function normalizeState(rawState = {}) {
  const fields = { ...EMPTY_FIELDS, ...(rawState.fields ?? {}) };
  const skipped = filterSkipped(rawState.skipped);
  const hasProgress =
    hasAnyUsefulField(fields) ||
    Object.keys(skipped).length > 0 ||
    rawState.awaiting_confirmation === true ||
    rawState.completed === true;
  const language = SUPPORTED_LANGUAGES.includes(rawState.language)
    ? rawState.language
    : hasProgress
      ? DEFAULT_LANGUAGE
      : null;

  return {
    fields,
    skipped,
    language,
    awaiting_language: rawState.awaiting_language ?? !language,
    awaiting_confirmation: rawState.awaiting_confirmation === true,
    confirmation_holds: Number.isInteger(rawState.confirmation_holds) ? rawState.confirmation_holds : 0,
    completed: rawState.completed === true,
    status: rawState.status ?? null,
    lead_id: rawState.lead_id ?? null,
    last_search_signature: rawState.last_search_signature ?? null,
  };
}

function serializeState(state) {
  return {
    fields: state.fields,
    skipped: state.skipped,
    language: state.language,
    awaiting_language: state.awaiting_language,
    awaiting_confirmation: state.awaiting_confirmation,
    confirmation_holds: state.confirmation_holds,
    completed: state.completed,
    status: state.status,
    lead_id: state.lead_id,
    last_search_signature: state.last_search_signature,
  };
}

function mergeFields(existing, extracted) {
  const merged = { ...existing };
  for (const key of FIELD_KEYS) {
    if (!hasValue(merged[key]) && hasValue(extracted[key])) {
      merged[key] = extracted[key];
    }
  }
  return merged;
}

function allFieldsResolved(fields, skipped) {
  return !findNextQuestion(fields, skipped);
}

function detectLanguageChoice(userMessage) {
  const normalized = userMessage.trim().toLowerCase();
  if (/^(1|english|eng|en)\b/.test(normalized)) return "en";
  if (/^(2|urdu|roman urdu|ur)\b/.test(normalized)) return "ur";
  return null;
}

function isOnlyLanguageChoice(userMessage) {
  return /^(1|2|english|eng|en|urdu|roman urdu|ur)[\s.!?]*$/i.test(userMessage.trim());
}

function inferLanguage(userMessage) {
  if (/[\u0600-\u06FF]/.test(userMessage)) return "ur";
  if (/\b(aap|apni|kya|hai|hain|chahiye|karna|mein|mujhe|mera|meri|kiraya|khareed|kharid|jaldi)\b/i.test(userMessage)) {
    return "ur";
  }
  return DEFAULT_LANGUAGE;
}

function isSkipReply(userMessage) {
  return SKIP_RE.test(userMessage);
}

function isConfirmationReply(userMessage) {
  return CONFIRM_RE.test(userMessage);
}

function isHoldReply(userMessage) {
  return HOLD_RE.test(userMessage);
}

function isEarlyExitReply(userMessage) {
  return EARLY_EXIT_RE.test(userMessage);
}

function nextPrompt(state) {
  const question = findNextQuestion(state.fields, state.skipped);
  if (!question) return null;
  return {
    key: question.key,
    acceptedFields: getAcceptedFields(question),
    prompt: getQuestionPrompt(state.language, question),
  };
}

function buildExtractionContext(state, currentQuestion) {
  return {
    language: state.language,
    current_question: currentQuestion
      ? {
          key: currentQuestion.key,
          prompt: currentQuestion.prompt,
          accepted_fields: currentQuestion.acceptedFields,
        }
      : null,
    collected_fields: state.fields,
    skipped_fields: state.skipped,
  };
}

function responseWithPrompt(prefix, prompt) {
  return prefix ? `${prefix}\n\n${prompt}` : prompt;
}

function changedFieldCount(before, after) {
  return FIELD_KEYS.filter((key) => !hasValue(before[key]) && hasValue(after[key])).length;
}

function acknowledgementFor(language, count) {
  if (count <= 0) return "";
  const copy = getCopy(language);
  return count > 1 ? copy.partialAcknowledge : copy.acknowledge;
}

function formatBudget(pkr) {
  if (!pkr) return null;
  return `PKR ${Number(pkr).toLocaleString("en-PK")}`;
}

function compactRequirementSummary(fields, language) {
  const parts = [];
  if (fields.purpose) parts.push(fields.purpose);
  if (fields.property_type) parts.push(fields.property_type);
  if (fields.location) parts.push(fields.location);
  if (fields.budget_pkr) parts.push(formatBudget(fields.budget_pkr));
  if (fields.size) parts.push(fields.size);
  else if (fields.bedrooms) parts.push(`${fields.bedrooms} bed`);

  if (parts.length === 0) return "";
  return language === "ur" ? `Requirement: ${parts.join(" / ")}` : `Requirement: ${parts.join(" / ")}`;
}

function searchSignature(fields) {
  if (!fields.location || !(fields.purpose || fields.property_type || fields.budget_pkr)) return null;
  return JSON.stringify({
    purpose: fields.purpose ?? null,
    location: fields.location ?? null,
    budget_pkr: fields.budget_pkr ?? null,
    property_type: fields.property_type ?? null,
    bedrooms: fields.bedrooms ?? null,
    size: fields.size ?? null,
  });
}

async function searchHint(state) {
  const signature = searchSignature(state.fields);
  if (!signature || state.last_search_signature === signature) return "";

  const { matches, source } = await searchListingsForLead(state.fields, { limit: 2 });
  if (matches.length === 0) return "";
  state.last_search_signature = signature;

  const lines = matches.map(
    (match) => `- ${match.title} (${match.size ?? "size N/A"}, ${formatBudget(match.budget_pkr) ?? "budget N/A"})`
  );
  if (state.language === "ur") {
    return `Search mein ${source === "demo" ? "demo " : ""}matches mil rahe hain:\n${lines.join("\n")}`;
  }
  return `I found ${source === "demo" ? "demo " : ""}matches:\n${lines.join("\n")}`;
}

function buildReply({ language, ack = "", summary = "", hint = "", prompt = "" }) {
  return [ack, summary, hint, prompt].filter(Boolean).join("\n\n");
}

async function persistProgress(phone, state) {
  const question = nextPrompt(state);
  await saveSession(phone, serializeState(state), question?.key ?? null);
  return question;
}

async function finalizeLead(phone, state, status, sessionId) {
  const { score, classification } = scoreLead(state.fields);
  const leadForSummary = { ...state.fields, score, classification, status };
  const lead = await saveLead({
    session_key: sessionId,
    phone: state.fields.phone ?? phone,
    name: state.fields.name,
    purpose: state.fields.purpose,
    location: state.fields.location,
    budget_pkr: state.fields.budget_pkr,
    property_type: state.fields.property_type,
    bedrooms: state.fields.bedrooms,
    size: state.fields.size,
    timeline: state.fields.timeline,
    wants_call: state.fields.wants_call,
    score,
    classification,
    status,
  });

  state.awaiting_language = false;
  state.awaiting_confirmation = false;
  state.completed = true;
  state.status = status;
  state.lead_id = lead.id;

  await saveSession(phone, serializeState(state), null);

  const summary = buildHandoffSummary(leadForSummary);
  if (status === "completed" && (classification === "Hot" || classification === "Warm")) {
    await notifyAgent(summary, leadForSummary);
  }

  return { lead, score, classification, summary };
}

async function askForConfirmation(phone, state) {
  state.awaiting_confirmation = true;
  state.confirmation_holds = 0;
  await saveSession(phone, serializeState(state), "confirm_close");
  return {
    reply: getCopy(state.language).confirmClose,
    done: false,
  };
}

/**
 * Core, channel-agnostic conversation step. Both the web chat adapter and
 * the Twilio WhatsApp adapter call this with the same inputs and get the
 * same outputs. The LLM extracts fields and intent only; code owns routing.
 *
 * @param {string} phone - stable id for the session (phone number or web session id)
 * @param {string} userMessage - raw inbound text
 * @returns {Promise<{reply: string, done: boolean, lead?: object}>}
 */
export async function handleIncomingMessage(phone, userMessage) {
  const session = await getOrCreateSession(phone);
  const state = normalizeState(session.state);
  const copy = getCopy(state.language);

  if (state.completed) {
    return { reply: copy.alreadyCompleted, done: true };
  }

  if (state.awaiting_language) {
    if (isEarlyExitReply(userMessage)) {
      state.language = DEFAULT_LANGUAGE;
      const leadResult = await finalizeLead(phone, state, "abandoned", session.id);
      return {
        reply: getCopy(state.language).exitMessage,
        done: true,
        lead: { ...leadResult.lead, summary: leadResult.summary },
      };
    }

    const language = detectLanguageChoice(userMessage);
    state.language = language ?? inferLanguage(userMessage);
    state.awaiting_language = false;

    if (language && isOnlyLanguageChoice(userMessage)) {
      const question = await persistProgress(phone, state);
      return { reply: question.prompt, done: false };
    }
  }

  const currentQuestion = nextPrompt(state);
  const extraction = await extractFields(userMessage, buildExtractionContext(state, currentQuestion));
  const usefulFieldFound = hasAnyUsefulField(extraction.fields);

  if (extraction.intent === "exit") {
    const leadResult = await finalizeLead(phone, state, "abandoned", session.id);
    return {
      reply: getCopy(state.language).exitMessage,
      done: true,
      lead: { ...leadResult.lead, summary: leadResult.summary },
    };
  }

  if (state.awaiting_confirmation) {
    const previousFields = state.fields;
    state.fields = mergeFields(state.fields, extraction.fields);
    const ack = acknowledgementFor(state.language, changedFieldCount(previousFields, state.fields));

    if (isHoldReply(userMessage)) {
      state.confirmation_holds += 1;
      if (state.confirmation_holds >= MAX_CONFIRMATION_HOLDS) {
        const leadResult = await finalizeLead(phone, state, "deferred", session.id);
        return {
          reply: getCopy(state.language).holdFinal,
          done: true,
          lead: { ...leadResult.lead, summary: leadResult.summary },
        };
      }

      await saveSession(phone, serializeState(state), "confirm_close");
      return { reply: getCopy(state.language).hold, done: false };
    }

    if (isConfirmationReply(userMessage)) {
      const leadResult = await finalizeLead(phone, state, "completed", session.id);
      return {
        reply: getCopy(state.language).closing[leadResult.classification],
        done: true,
        lead: { ...leadResult.lead, summary: leadResult.summary },
      };
    }

    await saveSession(phone, serializeState(state), "confirm_close");
    const reply = usefulFieldFound
      ? buildReply({
          language: state.language,
          ack,
          summary: compactRequirementSummary(state.fields, state.language),
          prompt: getCopy(state.language).confirmClose,
        })
      : responseWithPrompt(getCopy(state.language).redirect, getCopy(state.language).confirmClose);
    return { reply, done: false };
  }

  const skipCurrent = currentQuestion && isSkipReply(userMessage);

  const previousFields = state.fields;
  state.fields = mergeFields(state.fields, extraction.fields);
  const ack = acknowledgementFor(state.language, changedFieldCount(previousFields, state.fields));

  if (skipCurrent) {
    if (CRITICAL_FIELDS.includes(currentQuestion.key)) {
      const question = await persistProgress(phone, state);
      const critical = getCopy(state.language).criticalReassure[currentQuestion.key];
      return { reply: responseWithPrompt(critical, question.prompt), done: false };
    }

    state.skipped[currentQuestion.key] = true;
  }

  if (allFieldsResolved(state.fields, state.skipped)) {
    const hint = await searchHint(state);
    const result = await askForConfirmation(phone, state);
    return {
      ...result,
      reply: buildReply({
        language: state.language,
        ack,
        summary: compactRequirementSummary(state.fields, state.language),
        hint,
        prompt: result.reply,
      }),
    };
  }

  const hint = changedFieldCount(previousFields, state.fields) > 0 ? await searchHint(state) : "";
  const question = await persistProgress(phone, state);

  if (!usefulFieldFound && !skipCurrent) {
    const prefix = extraction.intent === "off_topic" ? getCopy(state.language).redirect : getCopy(state.language).reassure;
    return { reply: responseWithPrompt(prefix, question.prompt), done: false };
  }

  return {
    reply: buildReply({
      language: state.language,
      ack,
      summary: compactRequirementSummary(state.fields, state.language),
      hint,
      prompt: question.prompt,
    }),
    done: false,
  };
}

/**
 * Returns the first prompt for a new session. Direct Twilio sessions also
 * start here because getOrCreateSession initializes awaiting_language=true.
 */
export function firstPrompt() {
  return getCopy(DEFAULT_LANGUAGE).languagePrompt;
}
