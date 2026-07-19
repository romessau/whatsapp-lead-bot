import ChatWindow from "../components/ChatWindow";

export default function Home() {
  return (
    <main className="min-h-screen bg-app px-4 py-6 sm:px-8 lg:px-12">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="brand-mark"><span className="brand-dot">P</span><span>Pakistan Property Assistant</span></div>
        <a href="/admin" className="secondary-button">Agent dashboard</a>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-10 py-10 lg:grid-cols-[1fr_460px] lg:items-center lg:py-16">
        <div>
          <div className="eyebrow">Lahore-first · Pakistan-ready</div>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-6xl">
            Property conversations that become qualified leads.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            A bilingual AI sales assistant that understands natural property requirements, searches listings, scores intent, and prepares the right lead for a human agent.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Natural chat", "English, Urdu and Roman Urdu"],
              ["Structured leads", "Budget, area, type and timeline"],
              ["Human handoff", "WhatsApp and email ready"],
            ].map(([title, body]) => (
              <div key={title} className="feature-card"><div className="text-sm font-semibold text-slate-950">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{body}</div></div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-900">
            Try: <strong>&quot;DHA Lahore mein 3 crore tak 10 marla house chahiye, urgent&quot;</strong>
          </div>
        </div>
        <ChatWindow />
      </section>
    </main>
  );
}
