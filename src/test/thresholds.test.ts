import { describe, expect, it } from "vitest";
import { assessResults } from "@/mc/scoring";
import { crosses, evaluateScreening, evaluateTest, THRESHOLDS } from "@/mc/thresholds";
import { demoResults } from "@/mc/demoProfiles";
import type { TestScore } from "@/mc/scoring";

const ids = ["handhold", "voice", "spiral", "tap"] as const;
const mk = (id: (typeof ids)[number], score: number | null): TestScore => ({
  id, name: id, eligible: score != null, score, quality: score == null ? "not_completed" : "valid",
  exclusion: score == null ? "not_completed" : null, features: [], featureDescription: "", explanation: "", warnings: [], needsRetest: false,
});
const session = (scores: (number | null)[]) => ids.map((id, i) => mk(id, scores[i] ?? null));

describe("threshold engine", () => {
  it("score exactly at threshold counts as crossed", () => {
    expect(crosses(50, 50, "at_or_above")).toBe(true);
    expect(crosses(49.9, 50, "at_or_above")).toBe(false);
  });
  it("missing measurement is unable to assess, never normal", () => {
    expect(evaluateTest(mk("voice", null), 60).status).toBe("unable");
  });
  it.each([[0, "below"], [1, "below"], [2, "below"], [3, "referral"], [4, "referral"]] as const)("%i crossings → %s", (n, kind) => {
    const scores = ids.map((id, i) => (i < n ? 99 : 0));
    const o = evaluateScreening(session(scores), null);
    expect(o.crossed).toBe(n);
    expect(o.assessed).toBe(4);
    expect(o.kind).toBe(kind);
  });
  it("fewer than 3 valid tests without 3 crossings is incomplete", () => {
    const o = evaluateScreening(session([99, 99, null, null]), null);
    expect(o.kind).toBe("incomplete");
    expect(o.assessed).toBe(2);
  });
  it("3 crossings of 3 valid tests still recommends assessment", () => {
    expect(evaluateScreening(session([99, 99, 99, null]), null).kind).toBe("referral");
  });
  it("default referral rule is 3 crossings", () => {
    expect(evaluateScreening(session([99, 99, 0, 0]), null).kind).toBe("below");
  });
  it("demo profiles are deterministic and go through scoring", () => {
    const run = (p: "control" | "borderline" | "multiple") => evaluateScreening(assessResults(demoResults(p)).tests, null);
    expect(run("control").crossed).toBe(0);
    expect(run("borderline").crossed).toBe(2);
    expect(run("multiple").crossed).toBe(3);
    expect(run("multiple").kind).toBe("referral");
    expect(run("borderline")).toEqual(run("borderline"));
  });
  it("all thresholds are provisional at_or_above", () => {
    for (const id of ids) { expect(THRESHOLDS[id].comparison).toBe("at_or_above"); expect(THRESHOLDS[id].status).toBe("provisional"); }
  });
});
