/**
 * Pure, deterministic scoring — no LLM involved.
 * Mirrors the rubric in the project brief exactly.
 */
export function scoreLead(fields) {
  let score = 0;

  const budgetNumber = Number(fields.budget_pkr);
  const budgetProvided =
    fields.budget_pkr !== null &&
    fields.budget_pkr !== undefined &&
    fields.budget_pkr !== "" &&
    Number.isFinite(budgetNumber);
  if (budgetProvided) score += 15;

  const budgetRealistic = budgetProvided && budgetNumber > 0;
  if (budgetRealistic) score += 20;

  if (typeof fields.location === "string" && fields.location.trim()) score += 15;

  const urgentTimeline = fields.timeline === "urgent" || fields.timeline === "this_month";
  if (urgentTimeline) score += 20;

  if (fields.purpose === "buy" || fields.purpose === "invest") score += 10;

  const hasName = typeof fields.name === "string" && fields.name.trim();
  const hasPhone = typeof fields.phone === "string" && fields.phone.trim();
  if (hasName && hasPhone) score += 10;

  if (fields.wants_call === true) score += 10;

  score = Math.min(score, 100);

  let classification;
  if (score >= 80) classification = "Hot";
  else if (score >= 55) classification = "Warm";
  else if (score >= 30) classification = "Nurture";
  else classification = "Low intent";

  return { score, classification };
}

export function suggestedAction(classification) {
  switch (classification) {
    case "Hot":
      return "Call today";
    case "Warm":
      return "Send summary + booking link";
    case "Nurture":
      return "Ask 1-2 more questions or send generic info";
    default:
      return "Save only, no handoff";
  }
}
