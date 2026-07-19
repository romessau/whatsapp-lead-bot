"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getAdminLeads, updateAdminLead } from "../lib/api";
import { getSupabaseBrowserClient } from "../lib/supabase";

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  purpose: string | null;
  location: string | null;
  budget_pkr: number | string | null;
  property_type: string | null;
  bedrooms: number | null;
  size: string | null;
  timeline: string | null;
  wants_call: boolean | null;
  score: number | null;
  classification: string | null;
  status: string | null;
  pipeline_status: string;
  agent_notes: string | null;
  created_at: string;
};

type Stats = { total: number; new: number; hot: number; warm: number; wantsCall: number };

const PIPELINE = ["new", "contacted", "viewing", "won", "lost"];

function money(value: Lead["budget_pkr"]) {
  if (!value) return "Not provided";
  return `PKR ${Number(value).toLocaleString("en-PK")}`;
}

function age(date: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

function badgeTone(classification: string | null) {
  if (classification === "Hot") return "bg-rose-100 text-rose-700";
  if (classification === "Warm") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export default function AgentDashboard() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, new: 0, hot: 0, warm: 0, wantsCall: 0 });
  const [search, setSearch] = useState("");
  const [pipeline, setPipeline] = useState("all");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    getAdminLeads(session.access_token)
      .then((data) => {
        setLeads(data.leads);
        setStats(data.stats);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load leads"))
      .finally(() => setLoading(false));
  }, [session]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesPipeline = pipeline === "all" || lead.pipeline_status === pipeline;
      const haystack = [lead.name, lead.phone, lead.location, lead.property_type, lead.purpose]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesPipeline && (!query || haystack.includes(query));
    });
  }, [leads, pipeline, search]);

  async function sendMagicLink() {
    if (!supabase || !email.trim()) return;
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setLoading(false);
    if (authError) setError(authError.message);
    else setSent(true);
  }

  async function saveLead(id: string, updates: { pipeline_status?: string; agent_notes?: string }) {
    if (!session) return;
    setSaving(true);
    setError("");
    try {
      const { lead } = await updateAdminLead(session.access_token, id, updates);
      setLeads((current) => current.map((item) => (item.id === id ? lead : item)));
      if (selected?.id === id) setSelected(lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lead");
    } finally {
      setSaving(false);
    }
  }

  if (!supabase) {
    return (
      <div className="dashboard-panel max-w-xl mx-auto p-8">
        <h2 className="text-xl font-semibold">Agent dashboard is not configured</h2>
        <p className="mt-2 text-sm text-slate-600">
          Add the Supabase URL and publishable key to <code>frontend/.env.local</code>, then restart the frontend.
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="dashboard-panel max-w-md mx-auto p-8">
        <div className="eyebrow">Secure agent access</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Open your lead desk</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter an authorized agency email. Supabase will send a password-free sign-in link.
        </p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            sendMagicLink();
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="agent@agency.com"
            className="field-input"
          />
          <button className="primary-button w-full" disabled={loading}>
            {loading ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
        {sent && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Check your inbox for the sign-in link.</p>}
        {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">Lahore lead desk</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Agent pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as {session.user.email}</p>
        </div>
        <button className="secondary-button" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total", stats.total],
          ["New", stats.new],
          ["Hot", stats.hot],
          ["Warm", stats.warm],
          ["Call requested", stats.wantsCall],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
          <input className="field-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, area…" />
          <select className="field-input sm:max-w-48" value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
            <option value="all">All pipeline stages</option>
            {PIPELINE.map((stage) => <option key={stage} value={stage}>{stage[0].toUpperCase() + stage.slice(1)}</option>)}
          </select>
        </div>

        <div className="divide-y divide-slate-100">
          {loading && <div className="p-8 text-center text-sm text-slate-500">Loading leads…</div>}
          {!loading && filtered.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No matching leads yet.</div>}
          {filtered.map((lead) => (
            <button
              type="button"
              key={lead.id}
              onClick={() => { setSelected(lead); setNotes(lead.agent_notes ?? ""); }}
              className="grid w-full gap-3 p-4 text-left transition hover:bg-slate-50 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950">{lead.name || "Unnamed lead"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone(lead.classification)}`}>{lead.classification || "Unscored"}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">{lead.phone || "No phone"} · Score {lead.score ?? 0}</div>
              </div>
              <div className="text-sm"><div className="font-medium capitalize text-slate-800">{lead.purpose || "Purpose unknown"} {lead.property_type || "property"}</div><div className="text-slate-500">{lead.location || "Area unknown"}</div></div>
              <div className="text-sm"><div className="font-medium text-slate-800">{money(lead.budget_pkr)}</div><div className="text-slate-500">{age(lead.created_at)}</div></div>
              <select
                value={lead.pipeline_status || "new"}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => saveLead(lead.id, { pipeline_status: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm capitalize"
                disabled={saving}
              >
                {PIPELINE.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" onClick={() => setSelected(null)}>
          <div className="dashboard-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><div className="eyebrow">Lead detail</div><h2 className="mt-2 text-2xl font-semibold">{selected.name || "Unnamed lead"}</h2></div>
              <button className="secondary-button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Phone", selected.phone || "Not provided"],
                ["Requirement", `${selected.purpose || "—"} · ${selected.property_type || "—"}`],
                ["Area", selected.location || "Not provided"],
                ["Budget", money(selected.budget_pkr)],
                ["Size", selected.size || (selected.bedrooms ? `${selected.bedrooms} bedrooms` : "Not provided")],
                ["Timeline", selected.timeline || "Not provided"],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 font-medium capitalize text-slate-900">{value}</dd></div>)}
            </dl>
            <label className="mt-6 block text-sm font-semibold text-slate-800">Agent notes</label>
            <textarea className="field-input mt-2 min-h-28 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call outcome, viewing preference, next action…" />
            <button className="primary-button mt-3" disabled={saving} onClick={() => saveLead(selected.id, { agent_notes: notes })}>{saving ? "Saving…" : "Save notes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
