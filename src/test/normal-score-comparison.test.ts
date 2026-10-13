import { describe, expect, it } from "vitest";
import { normalScoreComparison } from "@/mc/interpretation";
import { demoResults } from "@/mc/demoProfiles";
import { assessResults } from "@/mc/scoring";
import { compareWithReference, REFERENCE_DATASETS } from "@/mc/interpretation";
import { evaluateScreening } from "@/mc/thresholds";

describe("normal score comparison", () => {
  it("supplies fictional demo normal scores from the control profile", () => {
    const rows = normalScoreComparison(assessResults(demoResults("multiple")).tests);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.normalScore)).toEqual([20, 25, 20, 25]);
  });

  it("calculates the illustrative control scores from feature values", () => {
    const rows = normalScoreComparison(assessResults(demoResults("multiple")).tests);
    expect(rows.map((r) => r.normalScore)).toEqual([20, 25, 20, 25]);
    expect(rows.map((r) => r.score)).toEqual([80, 70, 60, 40]);
  });

  it("keeps missing measurements missing instead of displaying zero", () => {
    const rows = normalScoreComparison(assessResults([]).tests);
    expect(rows.map((r) => r.score)).toEqual([null, null, null, null]);
    expect(rows.map((r) => r.normalScore)).toEqual([20, 25, 20, 25]);
  });

  it("does not turn fictional scores into validated references or alter referral decisions", () => {
    const tests = assessResults(demoResults("multiple")).tests;
    normalScoreComparison(tests);
    expect(REFERENCE_DATASETS).toEqual({});
    expect(tests.flatMap((t) => compareWithReference(t, 71)).every((c) => c.status === "unavailable")).toBe(true);
    expect(evaluateScreening(tests, 71).crossed).toBe(3);
    expect(evaluateScreening(tests, 71).kind).toBe("referral");
  });
});