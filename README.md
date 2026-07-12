# WhatsApp-Style Real Estate Lead-Qualification Bot (Demo)

Portfolio product demo for Pakistani real estate agencies: a WhatsApp-style
lead-qualification bot with structured listing search, deterministic scoring,
Supabase persistence, and optional agent handoff.

OpenAI is used only for one structured extraction + intent classification call
per normal user turn. Routing, skipping, confirmation, scoring, persistence,
listing search, and handoff decisions are all plain code.

```
/backend   Express API: webhook, state machine, extraction, scoring, search, Supabase
/frontend  Next.js + Tailwind chat UI that mirrors the WhatsApp conversation
```

## Current Flow

1. **Language selection first** - new web and Twilio sessions ask the user to
   choose English or Urdu / Roman Urdu. The language choice is deterministic
   keyword/number matching because it is a tiny command, not a lead intent.
2. **State machine in code** - `backend/src/config/questions.js` defines the
   fixed field order and localized copy. `stateMachine.js` asks the next
   missing, non-skipped field.
3. **Context-aware extraction wrapper** - `extraction.js` asks `OPENAI_MODEL`
   (default `gpt-4o-mini`) for JSON containing `intent` plus extracted fields.
   The call includes the current question, accepted fields, collected fields,
   skipped fields, and Pakistani market vocabulary. A small deterministic
   fallback captures common phrases such as `50 lac`, `10 marla`, `1 kanal`,
   `flat`, `dukan`, and `plot file` if the model under-extracts them.
   The allowed intents are `on_topic`, `uncertain`, `off_topic`, and `exit`.
4. **Skip and off-topic handling** - non-critical fields can be skipped with
   replies like `skip`, `idk`, or `not sure`. Name and phone are critical and
   are re-asked. Off-topic messages get redirected without advancing unless
   the same message also contains a usable answer.
5. **Exit handling** - `bye`, `not interested`, `stop`, and similar exit
   intents close the conversation and save an `abandoned` lead snapshot.
6. **Confirmation gate** - once all required fields are answered or skipped,
   the bot asks whether to save/pass the lead to the agency. Repeated hold-off
   replies are capped by `MAX_CONFIRMATION_HOLDS` and then saved as `deferred`
   so the flow cannot loop forever.
7. **Scoring in code** - `scoring.js` implements the rubric:
   budget provided +15, budget realistic +20, location +15,
   urgent/this-month timeline +20, buy/invest purpose +10,
   name+phone +10, wants-call true +10, capped at 100.
8. **Handoff** - completed Warm/Hot leads are sent to n8n or Resend if
   configured. Otherwise the summary is logged for demo visibility.
9. **Structured listing search** - `/api/search` accepts either natural
   language or structured fields, normalizes market phrasing, and searches
   active Supabase listings. If no DB listings exist, it falls back to demo
   inventory so the product path still works.
10. **Two front doors, one brain** - web chat (`/api/chat/*`) and Twilio
   WhatsApp Sandbox (`/webhook/whatsapp`) both call `handleIncomingMessage()`.
   The adapters only validate/translate transport payloads.

## Requirements

- Node.js 18+
- A Supabase project
- An OpenAI API key
- Optional: Twilio WhatsApp Sandbox
- Optional: n8n webhook URL or Resend API key for agent notifications

## 1. Database Setup

Run this in your Supabase SQL editor:

```sql
-- see backend/src/schema.sql
```

The schema creates `leads`, `chat_sessions`, and `listings`. The
`leads.status` column is `completed`, `abandoned`, or `deferred`, so incomplete
leads are not encoded inside `classification`. `leads.session_key` points at
the chat session and is unique, which makes final lead saves idempotent if a
confirmation is submitted twice.

## 2. Backend Setup

```bash
cd backend
cp .env.example .env
# fill in OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY at minimum
npm install
npm run seed:listings # optional: populate demo searchable inventory in Supabase
npm run dev
```

The API listens on `http://localhost:4000` by default. Check:

```bash
curl http://localhost:4000/health
```

Try structured search directly:

```bash
curl -X POST http://localhost:4000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"rent commercial in jt under 5 lac"}'
```

### Backend Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes | Extraction + intent classification |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini` |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side Supabase access |
| `PORT` | no | Defaults to 4000 |
| `CORS_ORIGIN` | no | Comma-separated allowed frontend origins |
| `BOOKING_URL` | no | Booking link shown in close/handoff copy |
| `MAX_CONFIRMATION_HOLDS` | no | Defaults to 2 |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | only for sandbox | Twilio WhatsApp Sandbox credentials |
| `N8N_WEBHOOK_URL` | no | If set, completed Warm/Hot handoffs POST here |
| `RESEND_API_KEY` / `AGENT_EMAIL` / `FROM_EMAIL` | no | Email fallback when no n8n URL is set |

## 3. Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The UI starts with language selection and shows
a clear error if the backend is unreachable.

Try:

> Mera budget 2 crore hai DHA phase 6 mein 3 bed chahiye

## 4. Twilio WhatsApp Sandbox

1. Create a Twilio account and join the WhatsApp Sandbox.
2. Expose the backend, for example `ngrok http 4000`.
3. Set the sandbox inbound webhook to:
   `https://<your-ngrok-url>/webhook/whatsapp` (POST).
4. Fill Twilio variables in `backend/.env`.
5. Message the sandbox number. A fresh phone number receives language
   selection first, then the same shared state-machine flow as the web demo.

## Resetting a Session

Sessions are keyed by phone number or web session id in `chat_sessions`.

```bash
cd backend
npm run seed:reset -- +923001234567
```

Leads already saved to `leads` remain untouched.

## Design Notes

- The LLM never routes, computes a score, chooses a next prompt, or decides
  whether to hand off. It only returns structured fields and one intent enum.
- `backend/src/services/search.js` is the first search-style layer. It builds
  locality abbreviations from listing locations, resolves fuzzy area text, and
  returns lightweight demo listing matches while the user is still answering.
- This is not a vector database yet. The current search layer is structured
  inventory matching; a vector/RAG layer would be the next step for large live
  inventory, listing descriptions, price sheets, and policy docs.
- `detectLanguageChoice()` remains deterministic because language selection is
  a small explicit command before the lead flow starts.
- `isHoldReply()` remains deterministic because the confirmation gate is a
  local yes/no control; routing it through the LLM would add latency without
  improving the state-machine decision.
- `classification` remains the score bucket (`Hot`, `Warm`, `Nurture`,
  `Low intent`). Completion state lives in `leads.status`.

## Non-Goals

- No production Meta Cloud API; Twilio Sandbox only
- No production vector database yet; current search uses structured demo inventory
- No payments
- No multi-agent or multi-tenant support
- No authentication for the demo UI
