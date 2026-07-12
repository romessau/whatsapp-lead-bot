import "dotenv/config";
import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chat.js";
import { searchRouter } from "./routes/search.js";
import { whatsappRouter } from "./routes/whatsapp.js";

const app = express();
const corsOrigins = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins?.length ? corsOrigins : "*",
  })
);
app.use(express.json());
// Twilio sends application/x-www-form-urlencoded for inbound webhooks.
app.use(express.urlencoded({ extended: false }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/chat", chatRouter);
app.use("/api/search", searchRouter);
app.use("/webhook/whatsapp", whatsappRouter);

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  console.error("[server] Unhandled request error", {
    path: req.path,
    method: req.method,
    message: err.message,
  });
  return res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Lead-bot backend listening on http://localhost:${PORT}`);
});
