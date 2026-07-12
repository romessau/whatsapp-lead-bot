const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

async function parseResponse(res: Response, fallback: string) {
  if (res.ok) return res.json();

  let detail = fallback;
  try {
    const body = await res.json();
    if (typeof body.error === "string") detail = body.error;
  } catch {
    // Keep the fallback when the backend is unreachable or returns non-JSON.
  }
  throw new Error(detail);
}

export async function startSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/chat/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return parseResponse(res, "Failed to start session");
}

export async function sendMessage(sessionId: string, message: string) {
  const res = await fetch(`${API_BASE}/api/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  return parseResponse(res, "Failed to send message");
}
