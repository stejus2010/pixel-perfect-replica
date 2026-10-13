/**
 * Deterministic SIMULATED demo profiles. These are illustrative feature values, not
 * real measurements. They are fed through the same scoring (assessResults) and
 * threshold engine (evaluateScreening) as real sessions.
 */
import type { AssessmentContext } from "./context";
import { TEST_NAMES, type TestResult } from "./types";

export type DemoProfileId = "control" | "borderline" | "multiple";

interface Values { rest: number; arm: number; f0cv: number; levelSd: number; spiralDev: number; tapCv: number }

export const DEMO_PROFILES: Record<DemoProfileId, { label: string; description: string; context: AssessmentContext; values: Values }> = {
  control: {
    label: "Control-like example",
    description: "Low variability on all four tests.",
    context: { age: 58, caffeine: "no" },
    values: { rest: 0.08, arm: 0.12, f0cv: 2.5, levelSd: 1.5, spiralDev: 4, tapCv: 10 },
  },
  borderline: {
    label: "Mixed / borderline example",
    description: "Two thresholds crossed, one exactly at its threshold.",
    context: { age: 66, caffeine: "yes" },
    values: { rest: 0.22, arm: 0.3, f0cv: 4, levelSd: 2.4, spiralDev: 8, tapCv: 18 },
  },
  multiple: {
    label: "Multiple-threshold example",
    description: "Three of four thresholds crossed — referral rule met.",
    context: { age: 71, caffeine: "no" },
    values: { rest: 0.35, arm: 0.45, f0cv: 7, levelSd: 4.2, spiralDev: 12, tapCv: 16 },
  },
};

const r = (id: TestResult["id"], metrics: TestResult["metrics"]): TestResult => ({
  id, name: TEST_NAMES[id], status: "valid", warnings: [], metrics,
  explanation: "SIMULATED DEMO DATA — illustrative values, not a real measurement.",
});

export function demoResults(id: DemoProfileId): TestResult[] {
  const v = DEMO_PROFILES[id].values;
  return [
    r("rest", [{ label: "RMS amplitude", value: v.rest, unit: "m/s²", digits: 3 }]),
    r("arm", [{ label: "RMS amplitude", value: v.arm, unit: "m/s²", digits: 3 }]),
    r("voice", [
      { label: "Pitch variation (CV)", value: v.f0cv, unit: "%", digits: 1 },
      { label: "Level variation (SD)", value: v.levelSd, unit: "dB", digits: 1 },
    ]),
    r("spiral", [{ label: "Mean deviation", value: v.spiralDev, unit: "% of radius", digits: 1 }]),
    r("tap", [{ label: "Interval variability (CV)", value: v.tapCv, unit: "%", digits: 1 }]),
  ];
}
