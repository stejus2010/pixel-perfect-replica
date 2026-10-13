/**
 * Plain-language interpretation and reference comparison for each scored test.
 * Shared by the results screen AND the PDF so both always say the same thing.
 *
 * REFERENCE DATA POLICY: Tremor ships no validated reference dataset that matches its own
 * protocol, device and population. Every comparison therefore resolves to an explicit
 * "unavailable" state. To add one, put a documented entry in REFERENCE_DATASETS — never
 * treat fictional demo normal scores as validated norms, and only compare metrics with the same unit and protocol.
 */
import { assessResults, SCORING_REFERENCE, type ScoredTestId, type TestScore } from "./scoring";
import { demoResults } from "./demoProfiles";

export const NORMAL_SCORE_TITLE = "Your score vs demo normal scores";
export const NORMAL_SCORE_NOTE = "FICTIONAL DEMO REFERENCE — these made-up normal scores illustrate the comparison only. They are not measured healthy-person averages, medically validated norms or target scores, and do not affect the screening outcome.";
export const NORMAL_SCORE_COLUMN = "Normal score (fictional demo)";

/** Illustrative comparator only; never used by screening or reference datasets. */
export function normalScoreComparison(tests: TestScore[]) {
  const example = assessResults(demoResults("control"));
  return tests.map((t) => ({
    id: t.id,
    name: t.name,
    score: t.eligible ? t.score : null,
    normalScore: example.tests.find((e) => e.id === t.id)?.score ?? null,
  }));
}

export interface ReferenceDataset {
  /** Must match a FeatureUsed label and unit exactly. */
  featureLabel: string;
  unit: string;
  kind: "normal_range" | "population_mean";
  low?: number;
  high?: number;
  mean?: number;
  ageMin?: number;
  ageMax?: number;
  population: string;
  sampleSize?: number;
  source: string;
}

/** Intentionally empty: no validated, protocol-matched reference data is available. */
export const REFERENCE_DATASETS: Partial<Record<ScoredTestId, ReferenceDataset[]>> = {};

export const REFERENCE_UNAVAILABLE_TITLE = "Reference data unavailable";
export const REFERENCE_UNAVAILABLE_TEXT =
  "This score can be used to summarize the measurement collected during your assessment, but it cannot currently be compared with a validated reference range.";

export type ReferenceComparison =
  | { status: "unavailable"; featureLabel: string; value: number | null; unit: string; reason: string }
  | { status: "invalid"; reason: string }
  | {
      status: "available"; featureLabel: string; value: number; unit: string; ref: ReferenceDataset;
      position: "below" | "within" | "above" | "vs_mean"; difference: number | null; interpretation: string;
    };

export function compareWithReference(t: TestScore, age: number | null): ReferenceComparison[] {
  if (!t.eligible || !t.features.length) {
    return [{ status: "invalid", reason: "No reliable measurement was collected for this test, so no comparison is shown." }];
  }
  const sets = REFERENCE_DATASETS[t.id] ?? [];
  return t.features.map((f) => {
    const ref = sets.find((r) => r.featureLabel === f.label && r.unit === f.unit &&
      (age == null || ((r.ageMin ?? 0) <= age && age <= (r.ageMax ?? 200))));
    if (!ref) return { status: "unavailable", featureLabel: f.label, value: f.value, unit: f.unit, reason: REFERENCE_UNAVAILABLE_TEXT };
    if (ref.kind === "normal_range" && ref.low != null && ref.high != null) {
      const position = f.value < ref.low ? "below" : f.value > ref.high ? "above" : "within";
      const difference = position === "below" ? f.value - ref.low : position === "above" ? f.value - ref.high : 0;
      return { status: "available", featureLabel: f.label, value: f.value, unit: f.unit, ref, position, difference,
        interpretation: position === "within" ? "Your measurement falls within this reference range." : `Your measurement falls ${position} this reference range. A difference from a reference range is not evidence of Parkinson's disease.` };
    }
    const difference = ref.mean != null ? f.value - ref.mean : null;
    return { status: "available", featureLabel: f.label, value: f.value, unit: f.unit, ref, position: "vs_mean", difference,
      interpretation: "Compared with a population average. An average is not an ideal or healthy value." };
  });
}

export interface TestExplanation {
  measures: string;
  meaning: string;
  scaleInfo: string;
  limitations: string[];
}

const COMMON_SCALE = "This is an experimental score derived from the measurements collected during this task. Its meaning depends on the feature measured and the scoring method. It is not a percentage chance of having Parkinson's disease.";

export const TEST_EXPLANATIONS: Record<ScoredTestId, TestExplanation> = {
  handhold: {
    measures: "How much the tablet moved while you tried to hold it still, in a resting position and with your arm out. The tablet's motion sensor records acceleration; RMS amplitude is the typical size of that movement.",
    meaning: `A higher score means more measured device movement. Each position's RMS amplitude is converted as 100 × amplitude ÷ ${SCORING_REFERENCE.handholdRms} m/s² (capped at 100), and the two positions are averaged. ${SCORING_REFERENCE.handholdRms} m/s² is an engineering choice, not a clinical threshold.`,
    scaleInfo: `${COMMON_SCALE} Hand Hold: higher = more measured tablet movement. ${SCORING_REFERENCE.handholdRms} m/s² RMS maps to 100.`,
    limitations: [
      "Movement can come from many sources other than tremor: shifting posture, breathing, muscle fatigue, or a slipping grip.",
      "Unreliable or low-rate sensor data can make the amplitude too high or too low.",
    ],
  },
  voice: {
    measures: "Selected features of your voice while you held an “ahhh” sound: how much your pitch varied (pitch CV, %) and how much your loudness varied (level SD, dB).",
    meaning: `A higher score means less steady pitch and loudness. Pitch CV is converted as 100 × CV ÷ ${SCORING_REFERENCE.voiceF0Cv}% and loudness SD as 100 × SD ÷ ${SCORING_REFERENCE.voiceLevelSd} dB (each capped at 100), then averaged.`,
    scaleInfo: `${COMMON_SCALE} Voice: higher = more variation in pitch and loudness. ${SCORING_REFERENCE.voiceF0Cv}% pitch CV and ${SCORING_REFERENCE.voiceLevelSd} dB loudness SD each map to 100.`,
    limitations: [
      "Voice features vary with speaking technique, microphone quality, background noise, fatigue, illness and hydration.",
      "A voice score does not diagnose Parkinson's disease or any other condition.",
    ],
  },
  spiral: {
    measures: "How closely your tracing followed the guide spiral. Tracing deviation is the average distance between your path and the spiral, as a percentage of the spiral's outer radius.",
    meaning: `A higher score means your trace was, on average, further from the guide. The score is 100 × mean deviation ÷ ${SCORING_REFERENCE.spiralDeviation}% of radius (capped at 100).`,
    scaleInfo: `${COMMON_SCALE} Spiral: higher = trace further from the guide. ${SCORING_REFERENCE.spiralDeviation}% of radius maps to 100.`,
    limitations: [
      "Poor touchscreen tracking, a stylus versus a finger, screen size, and incomplete tracing all affect the result.",
      "Tracing deviation has many causes and should not be assumed to come from a neurological disorder.",
    ],
  },
  tap: {
    measures: "The timing of your alternating taps. The tapping interval is the time between taps; interval variability (CV, %) shows how uneven those intervals were.",
    meaning: `A higher score means less regular tapping rhythm (greater timing variability) — it does not measure speed. The score is 100 × interval CV ÷ ${SCORING_REFERENCE.tapItiCv}% (capped at 100).`,
    scaleInfo: `${COMMON_SCALE} Tap Challenge: higher = more variable timing between taps. ${SCORING_REFERENCE.tapItiCv}% CV maps to 100.`,
    limitations: [
      "Practice, attention, fatigue and device touch responsiveness all affect tapping timing.",
      "Slow or irregular tapping is not specific evidence of Parkinson's disease.",
    ],
  },
};

export function nextStepFor(t: TestScore): string {
  if (!t.eligible) return `Repeat the ${t.name} — no reliable measurement was collected.`;
  if (t.needsRetest) return `Repeat the ${t.name} — a retest is recommended.`;
  if (t.quality === "limited") return `Consider repeating the ${t.name} in a steadier, quieter setting — data quality was limited.`;
  return "No action needed for this test. If you have concerning symptoms, discuss them with a healthcare professional regardless of this score.";
}

export function qualityText(t: TestScore): string {
  if (!t.eligible) return "Not included in the average: no reliable measurement.";
  if (t.quality === "limited") return "Limited data quality — interpret with caution.";
  return "Passed the data-quality checks.";
}
