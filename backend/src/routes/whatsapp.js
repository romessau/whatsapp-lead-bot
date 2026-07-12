import { Router } from "express";
import twilio from "twilio";
import { handleIncomingMessage } from "../services/stateMachine.js";

const { MessagingResponse } = twilio.twiml;

export const whatsappRouter = Router();

/**
 * Twilio WhatsApp Sandbox inbound webhook.
 * Point your sandbox's "When a message comes in" URL at:
 *   https://<your-tunnel-or-host>/webhook/whatsapp
 *
 * Twilio posts `From` (e.g. "whatsapp:+92300xxxxxxx") and `Body` (the text).
 * This adapter is deliberately thin: it only translates Twilio's payload
 * in/out. All actual logic lives in services/stateMachine.js, shared with
 * the web chat demo.
 */
whatsappRouter.post("/", async (req, res) => {
  const twiml = new MessagingResponse();

  try {
    const from = req.body.From; // e.g. "whatsapp:+923001234567"
    const body = req.body.Body;

    if (typeof from !== "string" || from.trim().length === 0) {
      twiml.message("Missing WhatsApp sender. Please try again.");
      res.status(400).type("text/xml").send(twiml.toString());
      return;
    }

    if (typeof body !== "string" || body.trim().length === 0) {
      twiml.message("Please send a text message so I can help.");
      res.status(400).type("text/xml").send(twiml.toString());
      return;
    }

    // Use the raw phone number (minus the "whatsapp:" prefix) as the
    // session key, matching what a real agency's CRM would key leads by.
    const phone = from.trim().replace("whatsapp:", "");

    const { reply } = await handleIncomingMessage(phone, body.trim());
    twiml.message(reply);
  } catch (err) {
    console.error("[whatsapp] Failed to process webhook", {
      from: req.body?.From,
      message: err.message,
    });
    twiml.message("Sorry, we hit a snag processing that. Please try again in a moment.");
  }

  res.type("text/xml").send(twiml.toString());
});
