import { CONFIG } from "./config";
import { mean, sd, type TestResult } from "./types";

export type Target = "A" | "B";
export interface TapEvent { t: number; target: Target | null; pointerType: string }

export function classifyTaps(events: TapEvent[]) {
  const valid: TapEvent[] = [];
  let misses = 0, repeated = 0, altErrors = 0;
  let prev: TapEvent | null = null;
  for (const e of events) {
    if (!e.target) { misses++; continue; }
    if (prev && prev.target === e.target) {
      if (e.t - prev.t < CONFIG.tap.doubleTapMs) { repeated++; continue; }
      altErrors++;
      prev = e;
      continue;
    }
    valid.push(e);
    prev = e;
  }
  const iti = valid.slice(1).map((e, i) => e.t - valid[i].t);
  return { valid, misses, repeated, altErrors, iti };
}

export function analyzeTap(events: TapEvent[], durationS: number): TestResult {
  const C = CONFIG.tap;
  const base = {
    id: "tap" as const,
    name: "Tap Challenge",
    explanation: "Timing between alternating taps on the two targets. Only taps that alternate correctly are counted as valid.",
  };
  if (!events.length) return { ...base, status: "not_completed", warnings: ["No taps recorded."], metrics: [] };
  const { valid, misses, repeated, altErrors, iti } = classifyTaps(events);
  const warnings: string[] = [];
  const h = iti.length >> 1;
  const first = mean(iti.slice(0, h)), second = mean(iti.slice(h));
  const errFrac = (misses + altErrors) / events.length;

  let status: TestResult["status"] = "valid";
  if (durationS < C.durationS * 0.8) { status = "invalid"; warnings.push("Test interrupted before 15 seconds."); }
  if (valid.length < C.minValidTaps) { status = "invalid"; warnings.push("Too few valid alternating taps."); }
  if (status === "valid" && errFrac > C.maxErrorFrac) { status = "limited"; warnings.push("Many missed or non-alternating taps."); }
  if (repeated) warnings.push(`${repeated} accidental double contact(s) ignored.`);

  return {
    ...base,
    status,
    warnings,
    series: iti.slice(0, 80),
    metrics: [
      { label: "Valid taps", value: valid.length, unit: "", digits: 0 },
      { label: "Tap rate", value: valid.length / durationS, unit: "taps/s", digits: 2 },
      { label: "Mean inter-tap interval", value: iti.length ? mean(iti) : null, unit: "ms", digits: 0 },
      { label: "Interval SD", value: iti.length > 2 ? sd(iti) : null, unit: "ms", digits: 0 },
      { label: "Interval variability (CV)", value: iti.length > 2 ? (100 * sd(iti)) / mean(iti) : null, unit: "%", digits: 1 },
      { label: "Speed change (2nd vs 1st half)", value: iti.length >= 6 ? (100 * (second - first)) / first : null, unit: "% interval", digits: 0 },
      { label: "Alternation errors", value: altErrors, unit: "", digits: 0 },
      { label: "Missed taps", value: misses, unit: "", digits: 0 },
    ],
  };
}

/** DEMO ONLY: synthetic alternating taps. */
export function demoTaps(): TapEvent[] {
  const out: TapEvent[] = [];
  let t = 0;
  for (let i = 0; t < 15000; i++) {
    out.push({ t, target: i % 2 ? "B" : "A", pointerType: "demo" });
    t += 290 + (Math.random() - 0.5) * 70 + i * 0.6;
  }
  return out;
}
