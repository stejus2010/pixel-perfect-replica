import { CONFIG } from "./config";
import { getMetric, type TestResult } from "./types";

export type OverallKind = "neutral" | "retest" | "incomplete" | "low" | "moderate" | "elevated";
export interface Summary {
  kind: OverallKind;
  title: string;
  text: string;
  counts: { valid: number; limited: number; invalid: number; not_completed: number };
  retest: string[];
  flags: string[];
}

export const DISCLAIMER =
  "This is an experimental movement-assessment prototype, not a medical diagnosis. A low-concern result does not rule out a medical condition. Seek professional assessment for persistent or concerning symptoms.";

export const LIMITATIONS = [
  "Clinical validity has not been established. No result indicates the presence or absence of any condition.",
  "Tablet motion sensors measure movement of the device, not the hand directly.",
  "Microphone level is uncalibrated and depends on the device and room.",
  "Sensor sampling rates and touch timing vary between devices and browsers.",
  "A single short session may not reflect usual movement or voice.",
];

export function summarize(results: TestResult[]): Summary {
  const counts = { valid: 0, limited: 0, invalid: 0, not_completed: 0 };
  results.forEach((r) => counts[r.status]++);
  const nc = results.filter((r) => r.status === "not_completed").map((r) => r.name);
  const inv = results.filter((r) => r.status === "invalid").map((r) => r.name);
  const base = { counts, retest: [...inv, ...nc], flags: [] as string[] };

  if (nc.length) return { ...base, kind: "incomplete", title: "Incomplete assessment", text: `Not completed: ${nc.join(", ")}. No overall summary can be given.` };
  if (inv.length) return { ...base, kind: "retest", title: "Retest required", text: `These tests did not produce usable data: ${inv.join(", ")}. Poor data quality is not an abnormal result.` };

  if (!CONFIG.scoring.enabled) {
    return {
      ...base,
      kind: "neutral",
      title: "Measurements recorded",
      text: "All tests produced usable data. Experimental scoring is disabled, so no concern category is shown. You can discuss the measured features with a healthcare professional.",
    };
  }
  const T = CONFIG.scoring.thresholds;
  const by = (id: string) => results.find((r) => r.id === id);
  const flags: string[] = [];
  const share = Math.max(getMetric(by("rest"), "4–6 Hz power share") ?? 0, getMetric(by("arm"), "4–6 Hz power share") ?? 0);
  if (share > T.motionBandSharePct) flags.push("Hand hold 4–6 Hz share above experimental threshold");
  if ((getMetric(by("voice"), "Pitch variation (CV)") ?? 0) > T.voiceF0CvPct) flags.push("Voice pitch variation above experimental threshold");
  if ((getMetric(by("spiral"), "Mean deviation") ?? 0) > T.spiralDeviationPct) flags.push("Spiral deviation above experimental threshold");
  if ((getMetric(by("tap"), "Interval variability (CV)") ?? 0) > T.tapItiCvPct) flags.push("Tap timing variability above experimental threshold");
  const kind: OverallKind = flags.length === 0 ? "low" : flags.length <= 2 ? "moderate" : "elevated";
  const title = { low: "Low concern", moderate: "Moderate concern", elevated: "Elevated concern" }[kind as "low"] + " (provisional, experimental)";
  return { ...base, flags, kind, title, text: "Unvalidated experimental categorisation based on configurable thresholds. Not a probability of disease." };
}
