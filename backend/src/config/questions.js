import { BOOKING_URL } from "./app.js";

export const DEFAULT_LANGUAGE = "en";
export const SUPPORTED_LANGUAGES = ["en", "ur"];
export const CRITICAL_FIELDS = ["name", "phone"];

export const QUESTION_ORDER = [
  { key: "purpose", promptKey: "purpose" },
  { key: "location", promptKey: "location" },
  { key: "budget_pkr", promptKey: "budget_pkr" },
  { key: "property_type", promptKey: "property_type" },
  { key: "bedrooms", promptKey: "bedrooms", accepts: ["bedrooms", "size"] },
  { key: "timeline", promptKey: "timeline" },
  { key: "name", promptKey: "name" },
  { key: "phone", promptKey: "phone" },
  { key: "wants_call", promptKey: "wants_call" },
];

export const FIELD_KEYS = [
  "purpose",
  "location",
  "budget_pkr",
  "property_type",
  "bedrooms",
  "size",
  "timeline",
  "name",
  "phone",
  "wants_call",
];

export const EMPTY_FIELDS = FIELD_KEYS.reduce((acc, key) => {
  acc[key] = null;
  return acc;
}, {});

export const COPY = {
  en: {
    languagePrompt:
      "Assalam-o-Alaikum! Please choose your preferred language:\n1. English\n2. Urdu / Roman Urdu",
    invalidLanguage:
      "Please reply with 1 for English or 2 for Urdu / Roman Urdu so I can continue.",
    reassure: "No worries. I just need this detail to match you with the right property.",
    redirect:
      "I can help with property requirements, budgets, locations, and agent follow-up. Let's continue.",
    acknowledge: "Got it.",
    partialAcknowledge: "Got it, I noted the useful details.",
    exitMessage:
      "No problem. I have marked this conversation as closed for now. You can message again anytime.",
    alreadyCompleted:
      "Thanks, your details are already saved. An agent will follow up if this is a fit.",
    criticalReassure: {
      name: "I need your name so an agent knows who to ask for.",
      phone: "I need a reachable phone number before I can pass this to an agent.",
    },
    confirmClose:
      "Thanks, I have the key details. Should I save this and pass it to the agency team now? (yes/no)",
    hold:
      "No problem. I can hold off for now. Reply yes when you want me to save and send this to the team.",
    holdFinal:
      "No problem. I will stop here and keep this marked as not ready for handoff.",
    closing: {
      Hot: `Thanks! I've saved everything and one of our agents will be in touch shortly.\n\nBook a call now: ${BOOKING_URL}`,
      Warm: `Thanks! I've saved everything and one of our agents will be in touch shortly.\n\nBook a call now: ${BOOKING_URL}`,
      Nurture:
        "Thanks for sharing that. We'll save your details and follow up if a matching option comes up.",
      "Low intent":
        "Thanks for the info. We've saved your details and will reach out if something relevant comes up.",
    },
    prompts: {
      purpose: "Are you looking to buy, rent, or invest?",
      location:
        "Great. Which area are you interested in? (for example DHA, Bahria Town, Gulberg, Askari, Johar Town)",
      budget_pkr: 'What is your budget range, roughly? (in PKR, for example "1.5 crore" or "50 lakh")',
      property_type: "What type of property? Plot, house, apartment, or commercial?",
      bedrooms: "How many bedrooms, or what size, are you looking for?",
      timeline: "What is your timeline: urgent, this month, within 3 months, or just exploring?",
      name: "Could I get your name, please?",
      phone: "And the best phone number to reach you on?",
      wants_call: "Would you like one of our agents to give you a call? (yes/no)",
    },
  },
  ur: {
    languagePrompt:
      "Assalam-o-Alaikum! Apni preferred language choose karein:\n1. English\n2. Urdu / Roman Urdu",
    invalidLanguage:
      "Barah-e-karam English ke liye 1 ya Urdu / Roman Urdu ke liye 2 reply karein.",
    reassure: "Koi masla nahi. Sahi property match karne ke liye yeh detail chahiye.",
    redirect:
      "Main property requirement, budget, location, aur agent follow-up mein madad kar sakta hun. Chaliye continue karte hain.",
    acknowledge: "Samajh gaya.",
    partialAcknowledge: "Samajh gaya, useful details note kar li hain.",
    exitMessage:
      "Theek hai. Maine is conversation ko abhi ke liye closed mark kar diya hai. Aap kabhi bhi dobara message kar sakte hain.",
    alreadyCompleted:
      "Shukriya, aapki details save ho chuki hain. Fit hua to agent follow up karega.",
    criticalReassure: {
      name: "Agent ko batane ke liye aapka naam zaroori hai.",
      phone: "Agent ko pass karne se pehle reachable phone number zaroori hai.",
    },
    confirmClose:
      "Shukriya, key details mil gayi hain. Kya main yeh save karke agency team ko bhej dun? (yes/no)",
    hold:
      "Theek hai, main abhi hold kar deta hun. Jab save karke team ko bhejna ho to yes reply karein.",
    holdFinal:
      "Theek hai. Main yahin stop karta hun aur isay handoff ke liye not ready mark kar deta hun.",
    closing: {
      Hot: `Shukriya! Details save ho gayi hain aur hamara agent jald rabta karega.\n\nCall book karein: ${BOOKING_URL}`,
      Warm: `Shukriya! Details save ho gayi hain aur hamara agent jald rabta karega.\n\nCall book karein: ${BOOKING_URL}`,
      Nurture:
        "Shukriya. Hum aapki details save kar rahe hain aur matching option aya to follow up karenge.",
      "Low intent":
        "Shukriya. Hum aapki details save kar rahe hain aur relevant option aya to rabta karenge.",
    },
    prompts: {
      purpose: "Aap buy, rent, ya invest karna chahte hain?",
      location:
        "Great. Aap kis area mein interested hain? (for example DHA, Bahria Town, Gulberg, Askari, Johar Town)",
      budget_pkr: 'Aapka budget roughly kitna hai? (PKR mein, for example "1.5 crore" ya "50 lakh")',
      property_type: "Property type kya chahiye? Plot, house, apartment, ya commercial?",
      bedrooms: "Kitne bedrooms, ya kis size ki property chahiye?",
      timeline: "Timeline kya hai: urgent, this month, within 3 months, ya just exploring?",
      name: "Aapka naam mil sakta hai?",
      phone: "Aur best phone number jahan aapse rabta ho sake?",
      wants_call: "Kya aap chahte hain hamara agent aapko call kare? (yes/no)",
    },
  },
};

export function getCopy(language) {
  return COPY[SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE];
}

export function findNextQuestion(fields, skipped = {}) {
  return QUESTION_ORDER.find((q) => {
    const acceptedKeys = q.accepts ?? [q.key];
    const answered = acceptedKeys.some((key) => {
      const value = fields[key];
      return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
    });
    return !answered && skipped[q.key] !== true;
  });
}

export function getQuestionPrompt(language, question) {
  return getCopy(language).prompts[question.promptKey];
}

export function getAcceptedFields(question) {
  return question?.accepts ?? (question ? [question.key] : []);
}
