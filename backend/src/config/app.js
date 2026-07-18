export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export const BOOKING_URL = process.env.BOOKING_URL ?? "https://cal.com/your-agency/intro-call";

export const RESEND_EMAILS_URL = process.env.RESEND_EMAILS_URL ?? "https://api.resend.com/emails";

const parsedConfirmationHolds = Number.parseInt(process.env.MAX_CONFIRMATION_HOLDS ?? "2", 10);
export const MAX_CONFIRMATION_HOLDS =
  Number.isFinite(parsedConfirmationHolds) && parsedConfirmationHolds > 0 ? parsedConfirmationHolds : 2;
