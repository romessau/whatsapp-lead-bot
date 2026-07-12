import "dotenv/config";
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

/**
 * Sends the handoff summary to whichever channel is configured.
 * Only fires for Warm/Hot leads (see stateMachine.js caller).
 * Falls back to console.log if nothing is configured, so the demo
 * still "works" end-to-end without extra signup friction.
 */
export async function notifyAgent(summary, lead) {
  if (process.env.N8N_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, lead }),
      });
      if (!response.ok) {
        throw new Error(
          `n8n webhook returned ${response.status} ${response.statusText}: ${await responseSnippet(response)}`
        );
      }
      return;
    } catch (err) {
      console.error("[handoff] n8n webhook failed, falling back to next channel", {
        urlConfigured: true,
        message: err.message,
      });
    }
  }

  if (process.env.RESEND_API_KEY && process.env.AGENT_EMAIL) {
    try {
      const response = await fetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL ?? "leads@example.com",
          to: process.env.AGENT_EMAIL,
          subject: `New ${lead.classification} lead — ${lead.location ?? ""}`,
          text: summary,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Resend returned ${response.status} ${response.statusText}: ${await responseSnippet(response)}`
        );
      }
      return;
    } catch (err) {
      console.error("[handoff] Resend email failed, falling back to console", {
        agentEmail: process.env.AGENT_EMAIL,
        fromEmail: process.env.FROM_EMAIL ?? "leads@example.com",
        message: err.message,
      });
    }
  }

  console.log("\n--- LEAD HANDOFF (no N8N_WEBHOOK_URL / RESEND_API_KEY set) ---\n" + summary + "\n---\n");
}
