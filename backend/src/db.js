import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Requests touching the DB will fail until backend/.env is configured."
  );
}

export const supabase =
  supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

function requireSupabase(operation) {
  if (!supabase) {
    const err = new Error("Supabase client is not configured");
    console.error(`[db] ${operation} failed`, {
      message: err.message,
      hasUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
    });
    throw err;
  }
  return supabase;
}

function logDbError(operation, err, context = {}) {
  console.error(`[db] ${operation} failed`, {
    ...context,
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
  });
}

function initialState() {
  return {
    fields: {},
    skipped: {},
    language: null,
    awaiting_language: true,
    awaiting_confirmation: false,
    confirmation_holds: 0,
    completed: false,
    status: null,
    lead_id: null,
  };
}

async function fetchSessionByPhone(phone) {
  const client = requireSupabase("fetchSessionByPhone");
  const { data, error } = await client.from("chat_sessions").select("*").eq("phone", phone).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Load (or create) a chat session for a given phone/session id.
 * State shape:
 * { fields, skipped, language, awaiting_language, awaiting_confirmation,
 *   confirmation_holds, completed, status, lead_id }
 */
export async function getOrCreateSession(phone) {
  const client = requireSupabase("getOrCreateSession");

  try {
    const existing = await fetchSessionByPhone(phone);
    if (existing) return existing;

    const { data: created, error: insertErr } = await client
      .from("chat_sessions")
      .insert({ phone, state: initialState(), current_step: "language" })
      .select("*")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const racedSession = await fetchSessionByPhone(phone);
        if (racedSession) return racedSession;
      }
      throw insertErr;
    }

    return created;
  } catch (err) {
    logDbError("getOrCreateSession", err, { phone });
    throw err;
  }
}

export async function saveSession(phone, state, currentStep) {
  const client = requireSupabase("saveSession");

  try {
    const { data, error } = await client
      .from("chat_sessions")
      .update({ state, current_step: currentStep, updated_at: new Date().toISOString() })
      .eq("phone", phone)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    logDbError("saveSession", err, { phone, currentStep });
    throw err;
  }
}

export async function deleteSession(phone) {
  const client = requireSupabase("deleteSession");

  try {
    const { error } = await client.from("chat_sessions").delete().eq("phone", phone);
    if (error) throw error;
  } catch (err) {
    logDbError("deleteSession", err, { phone });
    throw err;
  }
}

export async function saveLead(lead) {
  const client = requireSupabase("saveLead");

  try {
    const query = lead.session_key
      ? client.from("leads").upsert(lead, { onConflict: "session_key" })
      : client.from("leads").insert(lead);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    return data;
  } catch (err) {
    logDbError("saveLead", err, {
      sessionKey: lead.session_key,
      phone: lead.phone,
      status: lead.status,
      classification: lead.classification,
    });
    throw err;
  }
}

export async function getActiveListings() {
  const client = requireSupabase("getActiveListings");

  try {
    const { data, error } = await client
      .from("listings")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    logDbError("getActiveListings", err);
    throw err;
  }
}

export async function replaceDemoListings(listings) {
  const client = requireSupabase("replaceDemoListings");

  try {
    const { error: deleteErr } = await client.from("listings").delete().like("title", "%demo:%");
    if (deleteErr) throw deleteErr;

    const rows = listings.map((listing) => ({
      title: `demo: ${listing.title}`,
      purpose: listing.purpose,
      property_type: listing.property_type,
      location: listing.location,
      budget_pkr: listing.budget_pkr,
      bedrooms: listing.bedrooms ?? null,
      size: listing.size ?? null,
      description: listing.description ?? null,
      active: true,
    }));

    const { data, error } = await client.from("listings").insert(rows).select("*");
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    logDbError("replaceDemoListings", err, { count: listings.length });
    throw err;
  }
}
