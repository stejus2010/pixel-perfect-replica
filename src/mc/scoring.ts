/**
 * Tremor experimental scoring — single source of truth for the results screen AND the PDF.
 *
 * Scale: 0–100. 0 = lower measured deviation/variability, 100 = higher measured
 * deviation/variability, according to the provisional rules below.
 *
 * Method (provisional feature normalisation, NOT clinically validated):
 *   score = clamp(100 * feature / referenceMax, 0, 100)
 * `referenceMax` values are engineering choices for this prototype (the feature value that
 * maps to 100). They are NOT derived from a reference population and do NOT separate
 * healthy users from users with any condition. A score is not a probability of disease.
 *
 * Eligibility: a test is scored only when it was completed, passed the existing data-quality
 * checks (status "valid" or "limited"), and its feature is a finite, non-negative number.
 * Everything else is excluded from the average — never counted as zero.
 */
import { getMetric, type TestResult } from "./types";

export type ScoredTestId = "handhold" | "voice" | "spiral" | "tap";
export type DataQualityStatus = "valid" | "limited" | "invalid" | "not_completed";
export type ExclusionReason = "not_completed" | "failed_quality" | "invalid_measurement";

export const EXCLUSION_TEXT: Record<ExclusionReason, string> = {
  not_completed: "Test skipped or not completed",
  failed_quality: "Failed data-quality checks — retest required",
  invalid_measurement: "Required measurement missing or invalid",
};

/** Feature → 100 mapping. Engineering choices only. */
export const SCORING_REFERENCE = {
  /** Hand Hold: device RMS acceleration (m/s²). */
  handholdRms: 0.5,
  /** Voice: pitch coefficient of variation (%) and level SD (dB). */
  voiceF0Cv: 10,
  voiceLevelSd: 6,
  /** Spiral: mean tracing deviation (% of outer radius). */
  spiralDeviation: 20,
  /** Tap: inter-tap interval coefficient of variation (%). */
  tapItiCv: 40,
} as const;

export const SCORED_TEST_NAMES: Record<ScoredTestId, string> = {
  handhold: "Hand Hold",
  voice: "Voice Test",
  spiral: "Spiral Test",
  tap: "Tap Challenge",
};

export interface FeatureUsed { label: string; value: number; unit: string; digits: number }

export interface TestScore {
  id: ScoredTestId;
  name: string;
  eligible: boolean;
  /** 0–100 when eligible, otherwise null (displayed as "Insufficient data"). */
  score: number | null;
  quality: DataQualityStatus;
  exclusion: ExclusionReason | null;
  features: FeatureUsed[];
  featureDescription: string;
  explanation: string;
  warnings: string[];
  needsRetest: boolean;
}

export type AssessmentStatus = "complete" | "incomplete";

export interface AssessmentSummary {
  status: AssessmentStatus;
  statusLabel: string;
  average: number | null;
  eligibleCount: number;
  totalCount: number;
  tests: TestScore[];
  included: TestScore[];
  excluded: TestScore[];
  retest: TestScore[];
  interpretation: string;
  nextSteps: string[];
}

export const COMPLETE_EXPLANATION =
  "These results describe measurements collected during the Tremor assessment tasks. They are experimental and have not been clinically validated to diagnose or rule out Parkinson's disease.";
export const CONSULTATION_GUIDANCE =
  "If you have a persistent tremor, stiffness, slowness of movement, changes in walking, or other concerning symptoms, consult a qualified healthcare professional. You can share this report with them. If you have no symptoms, this experimental score alone does not establish a need for a Parkinson's-specific medical consultation.";
export const MEDICAL_DISCLAIMER =
  "Tremor is an experimental movement assessment prototype. Its scores and interpretations are not clinically validated to diagnose, predict, or rule out Parkinson's disease. The results are not a substitute for professional medical evaluation.";
export const SCORE_LABEL = "Experimental movement assessment score";

export const clampScore = (v: number) => Math.min(100, Math.max(0, v));
const finiteNonNeg = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const normalise = (v: number, ref: number) => clampScore((100 * v) / ref);

/** Arithmetic mean of eligible scores; null when none. Excluded tests are never counted as zero. */
export function averageScore(scores: Array<number | null | undefined>): number | null {
  const ok = scores.filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (!ok.length) return null;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

const ORDER: DataQualityStatus[] = ["valid", "limited", "invalid", "not_completed"];
const worstQ = (q: DataQualityStatus[]) => q.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), "valid");
const bestQ = (q: DataQualityStatus[]) => q.reduce((a, b) => (ORDER.indexOf(b) < ORDER.indexOf(a) ? b : a), "not_completed");
const usable = (r?: TestResult) => !!r && (r.status === "valid" || r.status === "limited");

function build(
  id: ScoredTestId,
  sources: (TestResult | undefined)[],
  featureDescription: string,
  compute: () => { score: number; features: FeatureUsed[]; explanation: string } | null,
): TestScore {
  const present = sources.filter(Boolean) as TestResult[];
  const statuses = present.map((r) => r.status as DataQualityStatus);
  const warnings = present.flatMap((r) => (sources.length > 1 ? r.warnings.map((w) => `${r.name}: ${w}`) : r.warnings));
  const base = { id, name: SCORED_TEST_NAMES[id], featureDescription, warnings };
  const anyUsable = present.some(usable);
  if (!anyUsable) {
    const quality: DataQualityStatus = !statuses.length ? "not_completed" : bestQ(statuses);
    const exclusion: ExclusionReason = quality === "not_completed" ? "not_completed" : "failed_quality";
    return { ...base, eligible: false, score: null, quality, exclusion, features: [], explanation: EXCLUSION_TEXT[exclusion] + ".", needsRetest: true };
  }
  const res = compute();
  const quality = worstQ(statuses.length ? statuses : ["not_completed"]);
  if (!res || !Number.isFinite(res.score)) {
    return { ...base, eligible: false, score: null, quality, exclusion: "invalid_measurement", features: [], explanation: EXCLUSION_TEXT.invalid_measurement + ".", needsRetest: true };
  }
  return { ...base, eligible: true, score: clampScore(res.score), quality, exclusion: null, features: res.features, explanation: res.explanation, needsRetest: quality === "invalid" || quality === "not_completed" };
}

export function scoreHandHold(rest?: TestResult, arm?: TestResult): TestScore {
  return build("handhold", [rest, arm], "Tablet RMS acceleration while holding still (resting and arm-out positions).", () => {
    const parts = [rest, arm].filter(usable).map((r) => ({ r: r!, v: getMetric(r, "RMS amplitude") })).filter((p) => finiteNonNeg(p.v));
    if (!parts.length) return null;
    const scores = parts.map((p) => normalise(p.v as number, SCORING_REFERENCE.handholdRms));
    return {
      score: averageScore(scores)!,
      features: parts.map((p) => ({ label: `${p.r.id === "rest" ? "Resting" : "Arm out"} RMS amplitude`, value: p.v as number, unit: "m/s²", digits: 3 })),
      explanation: `Higher scores mean more measured device movement. Device movement can come from many sources, not only tremor. ${SCORING_REFERENCE.handholdRms} m/s² maps to 100.`,
    };
  });
}

export function scoreVoice(voice?: TestResult): TestScore {
  return build("voice", [voice], "Pitch variation (CV) and loudness variation (SD) during a sustained vowel.", () => {
    const cv = getMetric(voice, "Pitch variation (CV)");
    const lsd = getMetric(voice, "Level variation (SD)");
    const parts: { s: number; f: FeatureUsed }[] = [];
    if (finiteNonNeg(cv)) parts.push({ s: normalise(cv, SCORING_REFERENCE.voiceF0Cv), f: { label: "Pitch variation (CV)", value: cv, unit: "%", digits: 1 } });
    if (finiteNonNeg(lsd)) parts.push({ s: normalise(lsd, SCORING_REFERENCE.voiceLevelSd), f: { label: "Level variation (SD)", value: lsd, unit: "dB", digits: 1 } });
    if (!parts.length) return null;
    return {
      score: averageScore(parts.map((p) => p.s))!,
      features: parts.map((p) => p.f),
      explanation: "Higher scores mean less steady pitch and loudness. Voice varies with fatigue, illness, microphone and room; this is not evidence of a neurological disorder.",
    };
  });
}

export function scoreSpiral(spiral?: TestResult): TestScore {
  return build("spiral", [spiral], "Mean distance between the traced path and the reference spiral.", () => {
    const dev = getMetric(spiral, "Mean deviation");
    if (!finiteNonNeg(dev)) return null;
    return {
      score: normalise(dev, SCORING_REFERENCE.spiralDeviation),
      features: [{ label: "Mean deviation", value: dev, unit: "% of radius", digits: 1 }],
      explanation: `Higher scores mean the trace was further from the guide. ${SCORING_REFERENCE.spiralDeviation}% of radius maps to 100. Tracing accuracy depends on stylus/finger, screen and familiarity.`,
    };
  });
}

export function scoreTap(tap?: TestResult): TestScore {
  return build("tap", [tap], "Variability of the time between alternating taps.", () => {
    const cv = getMetric(tap, "Interval variability (CV)");
    if (!finiteNonNeg(cv)) return null;
    return {
      score: normalise(cv, SCORING_REFERENCE.tapItiCv),
      features: [{ label: "Interval variability (CV)", value: cv, unit: "%", digits: 1 }],
      explanation: `Higher scores mean less regular tapping rhythm. ${SCORING_REFERENCE.tapItiCv}% CV maps to 100. Irregular tapping has many possible causes.`,
    };
  });
}

/** Build the complete assessment summary from analysed test results. */
export function assessResults(results: TestResult[]): AssessmentSummary {
  const by = (id: string) => results.find((r) => r.id === id);
  const tests = [scoreHandHold(by("rest"), by("arm")), scoreVoice(by("voice")), scoreSpiral(by("spiral")), scoreTap(by("tap"))];
  const included = tests.filter((t) => t.eligible);
  const excluded = tests.filter((t) => !t.eligible);
  const retest = tests.filter((t) => !t.eligible || t.needsRetest);
  const average = averageScore(included.map((t) => t.score));
  const status: AssessmentStatus = excluded.length === 0 ? "complete" : "incomplete";
  const limited = included.filter((t) => t.quality === "limited");

  let interpretation: string;
  if (average == null) {
    interpretation = "Insufficient data. No test produced a reliable measurement, so no score can be given. These results cannot determine whether you have Parkinson's disease.";
  } else if (status === "incomplete") {
    interpretation = `Partial result from ${included.length} of ${tests.length} tests. There is not enough reliable data for a complete summary, and this partial average is not equivalent to a complete assessment. The results cannot determine whether you have Parkinson's disease.`;
  } else {
    interpretation = COMPLETE_EXPLANATION;
  }

  const nextSteps: string[] = [];
  retest.forEach((t) => nextSteps.push(`Repeat the ${t.name}${t.exclusion ? ` (${EXCLUSION_TEXT[t.exclusion].toLowerCase()})` : ""}.`));
  if (status === "incomplete") nextSteps.push("Complete all four tests in a new assessment if you want a full experimental summary.");
  if (limited.length) nextSteps.push(`Consider repeating ${limited.map((t) => t.name).join(", ")} in a quieter, steadier setting — data quality was limited.`);
  nextSteps.push("No validated reference data is available for these tests, so your scores cannot be reliably compared with a reference range.");
  nextSteps.push("If you have persistent tremor, stiffness, slowness of movement, changes in walking or other concerning symptoms, consult a qualified healthcare professional. Without such symptoms, an experimental score alone does not establish a need for a Parkinson's-specific consultation.");
  nextSteps.push("Share this report with your healthcare professional if appropriate.");

  return {
    status,
    statusLabel: status === "complete" ? "Assessment completed" : "Assessment incomplete",
    average,
    eligibleCount: included.length,
    totalCount: tests.length,
    tests, included, excluded, retest,
    interpretation,
    nextSteps,
  };
}

export const fmtScore = (s: number | null) => (s == null ? "Insufficient data" : `${Math.round(s)}/100`);
