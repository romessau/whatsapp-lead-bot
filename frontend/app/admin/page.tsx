import AgentDashboard from "../../components/AgentDashboard";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-app px-4 py-6 sm:px-8 lg:px-12">
      <nav className="mx-auto mb-8 flex max-w-7xl items-center justify-between">
        <a href="/" className="brand-mark"><span className="brand-dot">P</span><span>Pakistan Property Assistant</span></a>
        <a href="/" className="secondary-button">Open assistant</a>
      </nav>
      <section className="mx-auto max-w-7xl"><AgentDashboard /></section>
    </main>
  );
}
