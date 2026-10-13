/**
 * Tremor screening thresholds + deterministic evaluation engine.
 *
 * SCORE DIRECTION (verified in scoring.ts): every test score is
 *   score = clamp(100 * feature / referenceMax, 0, 100)
 * where the feature is a deviation/variability measure. HIGHER score = MORE measured
 * deviation or variability. Therefore every threshold uses "at_or_above".
 *
 * STATUS: all thresholds are PROVISIONAL. No reference dataset has been downloaded or
 * analysed for this project, and no published cutoff maps defensibly onto Tremor's
 * custom 0–100 scores. Values are the prototype's original placeholder feature cutoffs
 * (config.ts `scoring.thresholds`) converted to the score scale where possible.
 * They are NOT clinically validated and must not be described as such.
 */
import type { ScoredTestId, TestScore } from "./scoring";

export type Comparison = "at_or_above" | "at_or_below";
export type ThresholdStatus = "provisional" | "research_derived" | "validated";

export interface AgeBand { minAge: number; maxAge: number; threshold: number }

export interface TestThreshold {
  threshold: number;
  comparison: Comparison;
  status: ThresholdStatus;
  rationale: string;
  /** Candidate dataset investigated; NOT processed. */
  candidateSource?: string;
  /** Populate only when compatible age-specific reference data exist. Empty = none. */
  ageBands: AgeBand[];
}

export const THRESHOLDS: Record<ScoredTestId, TestThreshold> = {
  handhold: {
    threshold: 50,
    comparison: "at_or_above",
    status: "provisional",
    rationale: "Provisional mid-scale cutoff (0.25 m/s² mean RMS device acceleration). No placeholder feature cutoff existed for RMS amplitude.",
    candidateSource: "Zenodo record 7273759 (hand movement dataset) — not yet analysed; feature compatibility with tablet RMS acceleration unverified.",
    ageBands: [],
  },
  voice: {
    threshold: 50,
    comparison: "at_or_above",
    status: "provisional",
    rationale: "Converted from the prototype placeholder of 5% pitch CV (5/10 x 100 = 50).",
    candidateSource: "UCI Parkinson's voice dataset (archive.ics.uci.edu/dataset/489) — not yet analysed; its features differ from Tremor's pitch CV / level SD.",
    ageBands: [],
  },
  spiral: {
    threshold: 40,
    comparison: "at_or_above",
    status: "provisional",
    rationale: "Converted from the prototype placeholder of 8% mean deviation (8/20 x 100 = 40).",
    candidateSource: "UCI Parkinson disease spiral drawing dataset (archive.ics.uci.edu/dataset/395) — not yet analysed; recorded with a tablet stylus, deviation metric not yet mapped.",
    ageBands: [],
  },
  tap: {
    threshold: 50,
    comparison: "at_or_above",
    status: "provisional",
    rationale: "Converted from the prototype placeholder of 20% inter-tap interval CV (20/40 x 100 = 50).",
    candidateSource: "FINGER-TAPPING-PARKINSONISMS-DATABASE (github.com/innovation-center-etf) — not yet analysed; uses finger-tapping kinematics, not alternating screen taps.",
    ageBands: [],
  },
};

export const REFERRAL_RULE = {
  /** Crossings needed to recommend medical assessment. */
  minCrossings: 3,
  /** Fewer valid tests than this → no screening outcome (incomplete). */
  minAssessed: 3,
} as const;

export const COMPARISON_TEXT: Record<Comparison, string> = {
  at_or_above: "Flagged at or above",
  at_or_below: "Flagged at or below",
};
export const STATUS_TEXT: Record<ThresholdStatus, string> = {
  provisional: "Provisional",
  research_derived: "Research-derived",
  validated: "Validated",
};

export type CrossingStatus = "crossed" | "not_crossed" | "unable";
export const CROSSING_TEXT: Record<CrossingStatus, string> = {
  crossed: "Threshold crossed",
  not_crossed: "Threshold not crossed",
  unable: "Unable to assess",
};

export interface TestEvaluation {
  id: ScoredTestId;
  name: string;
  score: number | null;
  threshold: number;
  comparison: Comparison;
  thresholdStatus: ThresholdStatus;
  status: CrossingStatus;
  explanation: string;
  limitedQuality: boolean;
}

export function thresholdFor(id: ScoredTestId, age: number | null, cfg = THRESHOLDS): number {
  const t = cfg[id];
  if (age != null) {
    const band = t.ageBands.find((b) => age >= b.minAge && age <= b.maxAge);
    if (band) return band.threshold;
  }
  return t.threshold;
}

export function crosses(score: number, threshold: number, comparison: Comparison): boolean {
  return comparison === "at_or_above" ? score >= threshold : score <= threshold;
}

export function evaluateTest(t: TestScore, age: number | null, cfg = THRESHOLDS): TestEvaluation {
  const c = cfg[t.id];
  const threshold = thresholdFor(t.id, age, cfg);
  const base = { id: t.id, name: t.name, score: t.score, threshold, comparison: c.comparison, thresholdStatus: c.status, limitedQuality: t.quality === "limited" };
  if (!t.eligible || t.score == null || !Number.isFinite(t.score)) {
    return { ...base, score: null, status: "unable", explanation: "Measurement missing or failed data-quality checks, so this test was not assessed." };
  }
  const hit = crosses(t.score, threshold, c.comparison);
  const s = Math.round(t.score * 10) / 10;
  return {
    ...base,
    status: hit ? "crossed" : "not_crossed",
    explanation: hit
      ? `Score ${s} is ${c.comparison === "at_or_above" ? "at or above" : "at or below"} the threshold of ${threshold}.`
      : `Score ${s} is ${c.comparison === "at_or_above" ? "below" : "above"} the threshold of ${threshold}.`,
  };
}

export type OutcomeKind = "referral" | "below" | "incomplete";

export interface ScreeningOutcome {
  kind: OutcomeKind;
  title: string;
  message: string;
  crossed: number;
  assessed: number;
  total: number;
  evaluations: TestEvaluation[];
  nextStep: string;
}

export function evaluateScreening(tests: TestScore[], age: number | null, cfg = THRESHOLDS, rule = REFERRAL_RULE): ScreeningOutcome {
  const evaluations = tests.map((t) => evaluateTest(t, age, cfg));
  const assessed = evaluations.filter((e) => e.status !== "unable").length;
  const crossed = evaluations.filter((e) => e.status === "crossed").length;
  const total = evaluations.length;
  const base = { crossed, assessed, total, evaluations };
  if (crossed >= rule.minCrossings) {
    return {
      ...base, kind: "referral",
      title: "Multiple screening thresholds crossed",
      message: `Your results crossed the configured screening thresholds in ${crossed} of ${assessed} tests. We recommend a medical assessment to investigate these findings.`,
      nextStep: "Arrange a medical assessment with a qualified healthcare professional and share this report.",
    };
  }
  if (assessed < rule.minAssessed) {
    return {
      ...base, kind: "incomplete",
      title: "Screening incomplete",
      message: `Only ${assessed} of ${total} tests produced valid measurements. At least ${rule.minAssessed} valid tests are needed for a screening outcome. Thresholds crossed: ${crossed}.`,
      nextStep: "Repeat the tests marked “Unable to assess” in a new session.",
    };
  }
  return {
    ...base, kind: "below",
    title: "Fewer screening thresholds crossed",
    message: `Your results crossed the configured screening thresholds in ${crossed} of ${assessed} tests. This result does not rule out Parkinson's disease or other medical conditions.`,
    nextStep: assessed < total
      ? "Repeat the unassessed test(s) for a complete four-test screening. If you have concerning symptoms, consult a healthcare professional."
      : "No referral rule was met. If you have persistent tremor, stiffness, slowness or other concerning symptoms, consult a healthcare professional.",
  };
}

export const EXPERIMENTAL_NOTE =
  "Experimental prototype. Thresholds are provisional and not clinically validated. This is a rule-based screening classification, not a diagnosis.";
