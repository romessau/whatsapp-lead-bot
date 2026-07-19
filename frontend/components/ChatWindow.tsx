"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessage, startSession } from "../lib/api";

type Message = {
  id: string;
  from: "bot" | "user";
  text: string;
};

function newSessionId() {
  return `demo-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChatWindow() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chatLogRef = useRef<HTMLDivElement>(null);

  const restart = async () => {
    const id = newSessionId();
    setSessionId(id);
    setMessages([]);
    setDone(false);
    setError("");
    setLoading(true);
    try {
      const { reply } = await startSession(id);
      setMessages([{ id: crypto.randomUUID(), from: "bot", text: reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backend is unreachable";
      setError(message);
      setMessages([
        {
          id: crypto.randomUUID(),
          from: "bot",
          text: "Demo backend is unreachable right now. Check the backend server and try Restart demo.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (chatLog) chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading || done) return;
    const text = input.trim();
    setInput("");
    setError("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), from: "user", text }]);
    setLoading(true);
    try {
      const { reply, done: isDone } = await sendMessage(sessionId, text);
      setMessages((m) => [...m, { id: crypto.randomUUID(), from: "bot", text: reply }]);
      if (isDone) setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong reaching the backend.";
      setError(message);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), from: "bot", text: `Something went wrong reaching the backend: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-[680px] bg-white rounded-[28px] shadow-chat border border-slate-200/80 overflow-hidden flex flex-col">
      <div className="bg-wa-green text-white px-5 py-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">Pakistan Property Assistant</div>
          <div className="text-xs text-green-100">AI property consultant · Lahore demo</div>
        </div>
        <button
          type="button"
          onClick={restart}
          className="text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
          Restart demo
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-xs text-red-700" role="status">
          {error}
        </div>
      )}

      <div
        ref={chatLogRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-wa-bg"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
            className={`max-w-[84%] px-3.5 py-2.5 rounded-2xl text-sm leading-6 whitespace-pre-wrap shadow-sm ${
                m.from === "user" ? "bg-wa-bubble" : "bg-white"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white px-3 py-2 rounded-lg text-sm shadow text-gray-400">…</div>
          </div>
        )}
      </div>

      <form
        className="p-3.5 bg-white border-t flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wa-light"
          placeholder={done ? "Conversation complete - restart to try again" : "Type a message..."}
          value={input}
          disabled={done || loading}
          aria-label="Message"
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={done || loading}
          className="bg-wa-green text-white rounded-full px-4 py-2 text-sm disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-wa-light"
        >
          {loading ? "Sending" : "Send"}
        </button>
      </form>
    </div>
  );
}
