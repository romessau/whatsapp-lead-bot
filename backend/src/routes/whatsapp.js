import { Router } from "express";
import twilio from "twilio";
import { getInboundReply, saveInboundReply } from "../db.js";
import { handleIncomingMessage } from "../services/stateMachine.js";

const { MessagingResponse } = twilio.twiml;

export const whatsappRouter = Router();

function publicWebhookUrl(req) {
  if (process.env.PUBLIC_WEBHOOK_URL) return process.env.PUBLIC_WEBHOOK_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}${req.originalUrl}`;
}

function hasValidTwilioSignature(req) {
  if (process.env.TWILIO_VALIDATE_SIGNATURE === "false") return true;
  if (!process.env.TWILIO_AUTH_TOKEN) return process.env.NODE_ENV !== "production";

  const signature = req.get("X-Twilio-Signature");
  if (!signature) return false;
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    publicWebhookUrl(req),
    req.body
  );
}

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
    if (!hasValidTwilioSignature(req)) {
      res.status(403).type("text/plain").send("Invalid Twilio signature");
      return;
    }

    const from = req.body.From; // e.g. "whatsapp:+923001234567"
    const body = req.body.Body;
    const messageSid = req.body.MessageSid ?? null;

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

    const previousReply = await getInboundReply(messageSid);
    if (previousReply) {
      twiml.message(previousReply);
      res.type("text/xml").send(twiml.toString());
      return;
    }

    const { reply } = await handleIncomingMessage(phone, body.trim(), {
      channel: "whatsapp",
      contactPhone: phone,
    });
    await saveInboundReply(messageSid, reply);
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
