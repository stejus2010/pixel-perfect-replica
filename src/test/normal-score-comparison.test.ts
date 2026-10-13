import { describe, expect, it } from "vitest";
import { normalScoreComparison } from "@/mc/interpretation";
import { demoResults } from "@/mc/demoProfiles";
import { assessResults } from "@/mc/scoring";

describe("normal score comparison", () => {
  it("does not invent a validated normal-person score", () => {
    const rows = normalScoreComparison(assessResults(demoResults("multiple")).tests);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.normalScore)).toEqual([null, null, null, null]);
  });

  it("calculates the illustrative control scores from feature values", () => {
    const rows = normalScoreComparison(assessResults(demoResults("multiple")).tests);
    expect(rows.map((r) => r.exampleScore)).toEqual([20, 25, 20, 25]);
    expect(rows.map((r) => r.score)).toEqual([80, 70, 60, 40]);
  });

  it("keeps missing measurements missing instead of displaying zero", () => {
    const rows = normalScoreComparison(assessResults([]).tests);
    expect(rows.map((r) => r.score)).toEqual([null, null, null, null]);
    expect(rows.map((r) => r.exampleScore)).toEqual([20, 25, 20, 25]);
  });
});