/**
 * Pre-assessment context (age + recent caffeine). Stored only in the in-memory session.
 * Age is CONTEXT for interpretation only — it never changes a score and is never used
 * to estimate the probability of any condition. No date of birth is stored.
 */

export type CaffeineAnswer = "yes" | "no";
export type CaffeineTiming = "lt1h" | "1to2h" | "2to3h" | "unsure";
export type CaffeineDrink = "coffee" | "tea" | "energy" | "other";

export interface AssessmentContext {
  /** Whole years. */
  age: number;
  caffeine: CaffeineAnswer;
  caffeineTiming?: CaffeineTiming | undefined;
  caffeineDrink?: CaffeineDrink | undefined;
}

export const AGE_MIN = 1;
export const AGE_MAX = 120;

export const CAFFEINE_TIMING_LABEL: Record<CaffeineTiming, string> = {
  lt1h: "Less than 1 hour ago",
  "1to2h": "1–2 hours ago",
  "2to3h": "2–3 hours ago",
  unsure: "Not sure",
};
export const CAFFEINE_DRINK_LABEL: Record<CaffeineDrink, string> = {
  coffee: "Coffee",
  tea: "Tea",
  energy: "Energy drink",
  other: "Other caffeinated drink",
};

export const CAFFEINE_NOTE =
  "Caffeine can affect alertness, physiological responses, and some movement measurements. Record your recent consumption so the assessment can display this context.";

export type AgeValidation = { ok: true; age: number } | { ok: false; error: string };

/** Validate a typed age. Accepts whole numbers only within a realistic range. */
export function validateAge(input: string | number | null | undefined): AgeValidation {
  if (input == null || String(input).trim() === "") return { ok: false, error: "Please enter your age." };
  const s = String(input).trim();
  if (!/^\d+$/.test(s)) return { ok: false, error: "Enter your age as a whole number of years." };
  const n = Number(s);
  if (!Number.isFinite(n) || n < AGE_MIN) return { ok: false, error: "Age must be greater than zero." };
  if (n > AGE_MAX) return { ok: false, error: `Please enter a realistic age (${AGE_MAX} or less).` };
  return { ok: true, age: n };
}

/** Compute age from a date of birth (YYYY-MM-DD) locally. Only the resulting age is kept. */
export function ageFromDob(dob: string, today: Date = new Date()): AgeValidation {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? "");
  if (!m) return { ok: false, error: "Please enter a valid date of birth." };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== d) return { ok: false, error: "Please enter a valid date of birth." };
  if (birth > today) return { ok: false, error: "Date of birth cannot be in the future." };
  let age = today.getFullYear() - y;
  if (today.getMonth() < mo - 1 || (today.getMonth() === mo - 1 && today.getDate() < d)) age--;
  return validateAge(age);
}

export function validateContext(c: Partial<AssessmentContext> | null | undefined): c is AssessmentContext {
  return !!c && validateAge(c.age as number).ok && (c.caffeine === "yes" || c.caffeine === "no");
}

export function caffeineSummary(c: AssessmentContext): string {
  if (c.caffeine === "no") return "No caffeine reported in the past 3 hours";
  const bits = [c.caffeineDrink && CAFFEINE_DRINK_LABEL[c.caffeineDrink], c.caffeineTiming && CAFFEINE_TIMING_LABEL[c.caffeineTiming].toLowerCase()].filter(Boolean);
  return `Caffeine consumed in the past 3 hours${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

/** Plain-language context notes. These explain interpretation; they never alter scores. */
export function contextNotes(c: AssessmentContext | null): string[] {
  if (!c) return ["Age and caffeine information were not recorded for this session."];
  const notes = [
    `Age recorded: ${c.age} years. Age is shown as context only. Many movement and voice measures vary with age, but Tremor has no validated age-specific reference data, so your scores are not adjusted for age and age is not used to estimate the chance of any condition.`,
  ];
  if (c.caffeine === "yes") {
    notes.push(`${caffeineSummary(c)}. Caffeine may affect alertness and some movement measurements, and its effect differs between people. Scores are not adjusted for caffeine; if a result surprises you, consider repeating the assessment at a time without recent caffeine.`);
  } else {
    notes.push("No recent caffeine reported. Scores are not adjusted for caffeine either way.");
  }
  return notes;
}
