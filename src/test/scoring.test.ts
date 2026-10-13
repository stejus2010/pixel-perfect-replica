import { describe, expect, it } from "vitest";
import { assessResults, averageScore, clampScore } from "@/mc/scoring";
import type { TestResult } from "@/mc/types";

const r = (id: TestResult["id"], status: TestResult["status"], metrics: Record<string, number | null> = {}): TestResult => ({
  id, name: id, status, warnings: [], explanation: "",
  metrics: Object.entries(metrics).map(([label, value]) => ({ label, value, unit: "" })),
});
const allValid = () => [
  r("rest", "valid", { "RMS amplitude": 0.1 }), // 20
  r("arm", "valid", { "RMS amplitude": 0.2 }), // 40 -> hand hold 30
  r("voice", "valid", { "Pitch variation (CV)": 5, "Level variation (SD)": 3 }), // 50
  r("spiral", "valid", { "Mean deviation": 4 }), // 20
  r("tap", "valid", { "Interval variability (CV)": 8 }), // 20
];

describe("averageScore", () => {
  it("averages 20, 40, 60 to 40", () => expect(averageScore([20, 40, 60])).toBe(40));
  it("ignores missing values instead of counting zero", () => expect(averageScore([20, null, 60])).toBe(40));
  it("returns null with no scores", () => expect(averageScore([null, undefined])).toBeNull());
  it("clamps to 0..100", () => { expect(clampScore(150)).toBe(100); expect(clampScore(-3)).toBe(0); });
});

describe("assessResults", () => {
  it("scenario 1: all valid -> 4 included, correct average", () => {
    const a = assessResults(allValid());
    expect(a.status).toBe("complete");
    expect(a.eligibleCount).toBe(4);
    expect(a.average).toBeCloseTo((30 + 50 + 20 + 20) / 4);
  });
  it("scenario 2: skipped test excluded, not zero", () => {
    const res = allValid(); res[4] = r("tap", "not_completed");
    const a = assessResults(res);
    expect(a.status).toBe("incomplete");
    expect(a.eligibleCount).toBe(3);
    expect(a.average).toBeCloseTo((30 + 50 + 20) / 3);
    expect(a.tests[3].score).toBeNull();
    expect(a.tests[3].exclusion).toBe("not_completed");
  });
  it("scenario 3: invalid data excluded with reason", () => {
    const res = allValid(); res[3] = r("spiral", "invalid", { "Mean deviation": 90 });
    const a = assessResults(res);
    expect(a.tests[2].exclusion).toBe("failed_quality");
    expect(a.average).toBeCloseTo((30 + 50 + 20) / 3);
  });
  it("non-finite measurement is excluded", () => {
    const res = allValid(); res[4] = r("tap", "valid", { "Interval variability (CV)": NaN });
    expect(assessResults(res).tests[3].exclusion).toBe("invalid_measurement");
  });
  it("scenario 4: multiple retests identified", () => {
    const res = allValid(); res[2] = r("voice", "invalid"); res[4] = r("tap", "invalid");
    const a = assessResults(res);
    expect(a.retest.map((t) => t.id)).toEqual(["voice", "tap"]);
    expect(a.eligibleCount).toBe(2);
  });
  it("scenario 5: no valid tests -> no average", () => {
    const a = assessResults([r("rest", "not_completed"), r("arm", "not_completed"), r("voice", "invalid"), r("spiral", "not_completed"), r("tap", "invalid")]);
    expect(a.average).toBeNull();
    expect(a.eligibleCount).toBe(0);
  });
  it("hand hold uses the usable position only", () => {
    const res = allValid(); res[1] = r("arm", "invalid");
    expect(assessResults(res).tests[0].score).toBeCloseTo(20);
  });
});

import { ageFromDob, contextNotes, validateAge, validateContext } from "@/mc/context";
import { compareWithReference, TEST_EXPLANATIONS } from "@/mc/interpretation";
import { SCORING_REFERENCE } from "@/mc/scoring";

describe("assessment context", () => {
  it("accepts valid age + caffeine yes/no", () => {
    expect(validateContext({ age: 45, caffeine: "yes", caffeineDrink: "coffee" })).toBe(true);
    expect(validateContext({ age: 45, caffeine: "no" })).toBe(true);
  });
  it("rejects invalid ages", () => {
    for (const v of ["", "0", "-3", "abc", "12.5", "200"]) expect(validateAge(v).ok).toBe(false);
    expect(validateContext({ age: 0, caffeine: "no" })).toBe(false);
  });
  it("computes age from DOB locally", () => {
    expect(ageFromDob("2000-06-15", new Date(2026, 5, 14))).toEqual({ ok: true, age: 25 });
    expect(ageFromDob("2030-01-01", new Date(2026, 0, 1)).ok).toBe(false);
  });
  it("context never changes scores", () => {
    const a = assessResults(allValid());
    expect(contextNotes({ age: 80, caffeine: "yes" }).length).toBe(2);
    expect(assessResults(allValid()).average).toBe(a.average);
  });
});

describe("reference comparison", () => {
  it("shows explicit unavailable state using the measured unit", () => {
    const t = assessResults(allValid()).tests.find((x) => x.id === "spiral")!;
    const c = compareWithReference(t, 40);
    expect(c[0].status).toBe("unavailable");
    if (c[0].status === "unavailable") { expect(c[0].unit).toBe("% of radius"); expect(c[0].value).toBe(4); }
  });
  it("invalid measurements produce no comparison", () => {
    const t = assessResults([r("spiral", "invalid")]).tests.find((x) => x.id === "spiral")!;
    expect(compareWithReference(t, 40)[0].status).toBe("invalid");
  });
  it("explanations reference the actual scoring constants", () => {
    expect(TEST_EXPLANATIONS.tap.meaning).toContain(`${SCORING_REFERENCE.tapItiCv}%`);
    expect(TEST_EXPLANATIONS.spiral.meaning).toContain(`${SCORING_REFERENCE.spiralDeviation}%`);
    expect(TEST_EXPLANATIONS.handhold.meaning).toContain(`${SCORING_REFERENCE.handholdRms} m/s²`);
  });
});
