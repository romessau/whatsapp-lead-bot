import "dotenv/config";
import twilio from "twilio";
import { BOOKING_URL, RESEND_EMAILS_URL } from "../config/app.js";
import { suggestedAction } from "./scoring.js";

function fmtBudget(pkr) {
  if (pkr === null || pkr === undefined || pkr === "") return "N/A";
  const number = Number(pkr);
  if (!Number.isFinite(number)) return "N/A";
  return `${number.toLocaleString("en-PK")}`;
}

export function buildHandoffSummary(lead) {
  const emoji = lead.classification === "Hot" ? "🔥" : lead.classification === "Warm" ? "🟡" : "📋";
  const tag = lead.classification.toUpperCase();

  return `${emoji} [${tag}] Lead — ${lead.location ?? "Unknown location"} ${lead.purpose ?? ""}
Status: ${lead.status ?? "completed"}
Name: ${lead.name ?? "N/A"}
Phone: ${lead.phone ?? "N/A"}
Interest: ${lead.purpose ?? "N/A"}
Budget: PKR ${fmtBudget(lead.budget_pkr)}
Looking for: ${lead.property_type ?? "N/A"}, ${lead.bedrooms ?? "?"} bed / ${lead.size ?? "N/A"}
Location: ${lead.location ?? "N/A"}
Timeline: ${lead.timeline ?? "N/A"}
Score: ${lead.score}/100
Suggested action: ${suggestedAction(lead.classification)}
Book a call: ${BOOKING_URL}`;
}

async function responseSnippet(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

async function notifyByWhatsApp(summary) {
  const required = [
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    process.env.TWILIO_WHATSAPP_FROM,
    process.env.AGENT_WHATSAPP_TO,
  ];
  if (required.some((value) => !value)) return false;

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, {
      timeout: 8_000,
    });
    const contentSid = process.env.TWILIO_AGENT_CONTENT_SID;
    const content = contentSid
      ? {
          contentSid,
          contentVariables: JSON.stringify({ "1": summary.slice(0, 1_000) }),
        }
      : { body: summary.slice(0, 1_500) };

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: process.env.AGENT_WHATSAPP_TO,
      ...content,
    });
    console.log("[handoff] WhatsApp notification queued", {
      messageSid: message.sid,
      status: message.status,
    });
    return true;
  } catch (err) {
    console.error("[handoff] WhatsApp notification failed", {
      errorCode: err.code,
      message: err.message,
    });
    return false;
  }
}

async function notifyByEmail(summary, lead) {
  if (!process.env.RESEND_API_KEY || !process.env.AGENT_EMAIL) return false;

  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL ?? "onboarding@resend.dev",
        to: process.env.AGENT_EMAIL,
        subject: `New ${lead.classification} lead — ${lead.location ?? ""}`,
        text: summary,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(
        `Resend returned ${response.status} ${response.statusText}: ${await responseSnippet(response)}`
      );
    }
    console.log("[handoff] Email notification accepted", { agentEmail: process.env.AGENT_EMAIL });
    return true;
  } catch (err) {
    console.error("[handoff] Resend email failed", {
      agentEmail: process.env.AGENT_EMAIL,
      fromEmail: process.env.FROM_EMAIL ?? "onboarding@resend.dev",
      message: err.message,
    });
    return false;
  }
}

async function notifyByN8n(summary, lead) {
  if (!process.env.N8N_WEBHOOK_URL) return false;

  try {
    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({ summary, lead }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(
        `n8n webhook returned ${response.status} ${response.statusText}: ${await responseSnippet(response)}`
      );
    }
    const result = await response.json().catch(() => null);
    if (result?.notified !== true) {
      throw new Error("n8n accepted the lead but did not confirm delivery to an agent");
    }
    return true;
  } catch (err) {
    console.error("[handoff] n8n workflow did not confirm a notification", {
      urlConfigured: true,
      message: err.message,
    });
    return false;
  }
}

/**
 * Sends the handoff summary to every configured direct notification channel.
 * Only fires for Warm/Hot leads (see stateMachine.js caller).
 * n8n remains an optional automation path and must confirm that it notified
 * someone. Falls back to console.log if no channel succeeds, so the demo
 * still "works" end-to-end without extra signup friction.
 */
export async function notifyAgent(summary, lead) {
  const results = await Promise.all([
    notifyByWhatsApp(summary),
    notifyByEmail(summary, lead),
    notifyByN8n(summary, lead),
  ]);

  if (!results.some(Boolean)) {
    console.log("\n--- LEAD HANDOFF (no notification channel succeeded) ---\n" + summary + "\n---\n");
  }

  return {
    whatsapp: results[0],
    email: results[1],
    n8n: results[2],
  };
}
