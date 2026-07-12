import { Router } from "express";
import { handleIncomingMessage, firstPrompt } from "../services/stateMachine.js";
import { deleteSession } from "../db.js";

export const chatRouter = Router();

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${fieldName} must be a non-empty string`;
  }
  return null;
}

// Kick off (or restart) a session and get the first question.
chatRouter.post("/start", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const validationError = requireString(sessionId, "sessionId");
    if (validationError) return res.status(400).json({ error: validationError });

    await deleteSession(sessionId.trim());
    res.json({ reply: firstPrompt(), done: false });
  } catch (err) {
    console.error("[chat] Failed to start session", {
      sessionId: req.body?.sessionId,
      message: err.message,
    });
    res.status(500).json({ error: "Failed to start session" });
  }
});

// Send a user message, get the bot's next reply.
chatRouter.post("/message", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const sessionError = requireString(sessionId, "sessionId");
    const messageError = requireString(message, "message");
    if (sessionError || messageError) {
      return res.status(400).json({ error: sessionError ?? messageError });
    }

    const result = await handleIncomingMessage(sessionId.trim(), message.trim());
    res.json(result);
  } catch (err) {
    console.error("[chat] Failed to process message", {
      sessionId: req.body?.sessionId,
      message: err.message,
    });
    res.status(500).json({ error: "Failed to process message" });
  }
});
