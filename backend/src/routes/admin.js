import { Router } from "express";
import { supabase, listLeads, updateLeadPipeline } from "../db.js";

export const adminRouter = Router();

const PIPELINE_STATUSES = new Set(["new", "contacted", "viewing", "won", "lost"]);

function allowedAgentEmails() {
  return (process.env.ADMIN_EMAILS ?? process.env.AGENT_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAgent(req, res, next) {
  const token = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Agent sign-in required" });
  if (!supabase) return res.status(503).json({ error: "Supabase is not configured" });

  const emails = allowedAgentEmails();
  if (emails.length === 0) {
    return res.status(503).json({ error: "ADMIN_EMAILS or AGENT_EMAIL must be configured" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    const email = data.user?.email?.toLowerCase();
    if (error || !email) return res.status(401).json({ error: "Agent session is invalid or expired" });
    if (!emails.includes(email)) return res.status(403).json({ error: "This account is not an authorized agent" });
    req.agent = { id: data.user.id, email };
    return next();
  } catch (err) {
    console.error("[admin] Failed to verify agent", { message: err.message });
    return res.status(401).json({ error: "Agent session could not be verified" });
  }
}

function leadStats(leads) {
  return leads.reduce(
    (stats, lead) => {
      stats.total += 1;
      if (lead.pipeline_status === "new") stats.new += 1;
      if (lead.classification === "Hot") stats.hot += 1;
      if (lead.classification === "Warm") stats.warm += 1;
      if (lead.wants_call === true) stats.wantsCall += 1;
      return stats;
    },
    { total: 0, new: 0, hot: 0, warm: 0, wantsCall: 0 }
  );
}

adminRouter.use(requireAgent);

adminRouter.get("/me", (req, res) => {
  res.json({ agent: req.agent });
});

adminRouter.get("/leads", async (req, res) => {
  try {
    const leads = await listLeads({ limit: req.query.limit });
    res.json({ leads, stats: leadStats(leads) });
  } catch (err) {
    console.error("[admin] Failed to list leads", { message: err.message });
    res.status(500).json({ error: "Failed to load leads" });
  }
});

adminRouter.patch("/leads/:id", async (req, res) => {
  const updates = {};

  if (req.body.pipeline_status !== undefined) {
    if (!PIPELINE_STATUSES.has(req.body.pipeline_status)) {
      return res.status(400).json({ error: "Invalid pipeline status" });
    }
    updates.pipeline_status = req.body.pipeline_status;
  }

  if (req.body.agent_notes !== undefined) {
    if (typeof req.body.agent_notes !== "string" || req.body.agent_notes.length > 2_000) {
      return res.status(400).json({ error: "Agent notes must be a string under 2,000 characters" });
    }
    updates.agent_notes = req.body.agent_notes.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No supported lead changes supplied" });
  }

  try {
    const lead = await updateLeadPipeline(req.params.id, updates);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json({ lead });
  } catch (err) {
    console.error("[admin] Failed to update lead", { id: req.params.id, message: err.message });
    res.status(500).json({ error: "Failed to update lead" });
  }
});
