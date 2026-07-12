import ChatWindow from "../components/ChatWindow";

export default function Home() {
  return (
    <main className="flex flex-col items-center gap-4 p-6">
      <h1 className="text-xl font-semibold text-gray-700">Real Estate Lead-Qualification Bot</h1>
      <p className="text-sm text-gray-500 max-w-md text-center">
        This mirrors the WhatsApp conversation: choose a language, answer in one or many messages,
        then confirm before the lead is saved. Try Roman Urdu, e.g.{" "}
        <em>&quot;Mera budget 2 crore hai DHA phase 6 mein 3 bed chahiye&quot;</em>.
      </p>
      <ChatWindow />
    </main>
  );
}
