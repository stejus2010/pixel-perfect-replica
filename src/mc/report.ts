import { LIMITATIONS, type Summary } from "./quality";
import { assessResults, CONSULTATION_GUIDANCE, EXCLUSION_TEXT, fmtScore, MEDICAL_DISCLAIMER } from "./scoring";
import { caffeineSummary, contextNotes, type AssessmentContext } from "./context";
import { compareWithReference, nextStepFor, normalScoreComparison, NORMAL_SCORE_COLUMN, NORMAL_SCORE_NOTE, NORMAL_SCORE_TITLE, qualityText, REFERENCE_UNAVAILABLE_TITLE, TEST_EXPLANATIONS } from "./interpretation";
import { COMPARISON_TEXT, CROSSING_TEXT, evaluateScreening, EXPERIMENTAL_NOTE, REFERRAL_RULE, STATUS_TEXT, THRESHOLDS } from "./thresholds";
import { DEMO_PROFILES, type DemoProfileId } from "./demoProfiles";
import { fmtValue, QUALITY_LABEL, type TestResult } from "./types";

const clean = (s: string) =>
  s.replace(/²/g, "^2").replace(/[—–]/g, "-").replace(/…/g, "...").replace(/°/g, " deg")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, "");

export interface ReportInput { id: string; startedAt: Date; demo: boolean; context?: AssessmentContext | null; results: TestResult[]; summary: Summary; demoProfile?: DemoProfileId | undefined }

export async function buildReportPdf(r: ReportInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18;
  let y = 0;
  const ink: [number, number, number] = [30, 41, 59];
  const muted: [number, number, number] = [100, 116, 139];
  const ensure = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20; } };
  const text = (s: string, size = 10, bold = false, color = ink, x = M, w = W - 2 * M) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(clean(s), w);
    const h = lines.length * size * 0.42 + 1.5;
    ensure(h);
    doc.text(lines, x, y + size * 0.35);
    y += h;
  };

  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(191, 219, 254);
  doc.rect(0, 30, W, 1.2, "F");
  doc.setTextColor(243, 247, 252);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Tremor by Kinetiq", M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Screening Report", W - M, 14, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(r.demo ? "SIMULATED DEMO DATA - not real measurements" : "Measured data - experimental prototype", M, 22);
  y = 40;

  text(`Date: ${r.startedAt.toLocaleString()}`, 10);
  text(`Anonymous session ID: ${r.id}`, 10);
  text(`Data source: ${r.demo ? `SIMULATED DEMO DATA${r.demoProfile ? ` (${DEMO_PROFILES[r.demoProfile].label})` : ""}` : "Measured on this device"}`, 10, true, r.demo ? [180, 83, 9] : ink);
  y += 3;
  text("Assessment context", 13, true);
  text(`Age: ${r.context ? r.context.age : "Not recorded"}`, 10);
  text(`Recent caffeine: ${r.context ? caffeineSummary(r.context) : "Not recorded"}`, 10);
  contextNotes(r.context ?? null).forEach((n) => text(n, 9, false, muted));
  y += 3;
  const A = assessResults(r.results);
  const O = evaluateScreening(A.tests, r.context?.age ?? null);
  text("Overall screening outcome", 13, true);
  text(O.title, 14, true, O.kind === "referral" ? [185, 28, 28] : ink);
  text(O.message, 10);
  text(`Tests assessed: ${O.assessed} of ${O.total}  |  Thresholds crossed: ${O.crossed}  |  Referral rule: ${REFERRAL_RULE.minCrossings}+ crossings (min. ${REFERRAL_RULE.minAssessed} valid tests)`, 10, true);
  text(`Recommended next step: ${O.nextStep}`, 10);
  text(EXPERIMENTAL_NOTE, 9, false, muted);
  y += 3;
  text("Threshold evaluation", 13, true);
  O.evaluations.forEach((e) => {
    const c = THRESHOLDS[e.id];
    text(`${e.name}: ${e.score != null ? `${Math.round(e.score)}/100` : "No score"}  |  Threshold ${e.threshold} (${COMPARISON_TEXT[e.comparison].toLowerCase()})  |  ${CROSSING_TEXT[e.status]}`, 10, true);
    text(`${e.explanation}${e.limitedQuality ? " Limited data quality." : ""}`, 9);
    text(`Threshold status: ${STATUS_TEXT[c.status]}. ${c.rationale}`, 8.5, false, muted);
  });
  y += 3;
  text("Individual test results", 13, true);
  A.tests.forEach((t) => {
    text(`${t.name}: ${fmtScore(t.score)}  -  ${QUALITY_LABEL[t.quality]}`, 11, true);
    text(`Measured feature: ${t.featureDescription}`, 9, false, muted);
    t.features.forEach((f) => text(`  ${f.label}: ${f.value.toFixed(f.digits)} ${f.unit}`, 9));
    text(t.explanation, 9, false, muted);
    if (t.needsRetest) text(`! Retest recommended${t.exclusion ? `: ${EXCLUSION_TEXT[t.exclusion]}` : ""}`, 9, false, [180, 83, 9]);
    y += 1.5;
  });
  y += 2;
  ensure(65);
  text(NORMAL_SCORE_TITLE, 13, true);
  text(NORMAL_SCORE_NOTE, 9, false, muted);
  normalScoreComparison(A.tests).forEach((row) => {
    ensure(17);
    text(`${row.name} | Your score: ${fmtScore(row.score)}`, 10, true);
    text(`${NORMAL_SCORE_COLUMN}: ${fmtScore(row.normalScore)}`, 9);
  });
  text("Matching the example does not establish health; differing from it does not establish disease. All scores use each test's experimental 0-100 scale.", 9, false, muted);
  y += 3;
  text("Understanding your results", 13, true);
  A.tests.forEach((t) => {
    const e = TEST_EXPLANATIONS[t.id];
    text(`${t.name}: ${fmtScore(t.score)}`, 11, true);
    text(`What this test measures: ${e.measures}`, 9);
    text(`What the score means: ${e.meaning}`, 9);
    text(`Score scale: ${e.scaleInfo}`, 9, false, muted);
    text("Your result vs reference:", 9, true);
    compareWithReference(t, r.context?.age ?? null).forEach((c) => {
      if (c.status === "invalid") text(`  ${c.reason}`, 9, false, muted);
      else if (c.status === "unavailable") { text(`  ${c.featureLabel}: ${c.value != null ? `${c.value.toFixed(2)} ${c.unit}` : "Not available"}  |  Reference: ${REFERENCE_UNAVAILABLE_TITLE}`, 9); text(`  ${c.reason}`, 9, false, muted); }
      else text(`  ${c.featureLabel}: ${c.value.toFixed(2)} ${c.unit} - ${c.interpretation} Source: ${c.ref.source}`, 9);
    });
    text(`Data quality: ${qualityText(t)} ${e.limitations.join(" ")}`, 9, false, muted);
    text(`Next step: ${nextStepFor(t)}`, 9);
    y += 1.5;
  });
  y += 2;
  text("Data quality", 13, true);
  if (!A.excluded.length) text("All tests were included in the average.", 10, false, muted);
  A.excluded.forEach((t) => text(`- Excluded: ${t.name} - ${t.exclusion ? EXCLUSION_TEXT[t.exclusion] : ""}`, 9.5));
  A.tests.flatMap((t) => t.warnings).forEach((w) => text(`- ${w}`, 9, false, muted));
  y += 3;
  text("Recommended next steps", 13, true);
  A.nextSteps.forEach((n) => text(`- ${n}`, 9.5));
  text(CONSULTATION_GUIDANCE, 9.5, false, muted);
  y += 3;
  text("Medical disclaimer", 13, true);
  text(MEDICAL_DISCLAIMER, 10, true);
  y += 3;

  text("Measurement details", 13, true);
  
  r.results.forEach((t) => {
    ensure(6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
    doc.text(clean(t.name), M, y + 3.5);
    doc.text(clean(QUALITY_LABEL[t.status]), M + 90, y + 3.5);
    y += 6;
  });
  y += 3;

  r.results.forEach((t) => {
    ensure(20);
    doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 3;
    text(`${t.name}  -  ${QUALITY_LABEL[t.status]}`, 12, true);
    text(t.explanation, 9, false, muted);
    if (!t.metrics.length) text("No measurements available.", 10, false, muted);
    t.metrics.forEach((m) => {
      ensure(5.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...ink);
      doc.text(clean(m.label), M + 2, y + 3.5);
      const v = fmtValue(m);
      doc.text(clean(v === "Not available" ? v : `${v} ${m.unit}`), M + 95, y + 3.5);
      y += 5.2;
    });
    t.warnings.forEach((w) => text(`! ${w}`, 9, false, [180, 83, 9]));
    y += 3;
  });

  ensure(30);
  text("Important limitations", 13, true);
  LIMITATIONS.forEach((l) => text(`- ${l}`, 9, false, muted));
  y += 3;
  text("Generated entirely on this device. Not uploaded to any server.", 9, false, muted);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(clean(`Tremor | Developed by Kinetiq  -  ${r.id}${r.demo ? "  -  SIMULATED DEMO DATA" : ""}  -  Page ${i}/${pages}`), M, 290);
  }
  return doc.output("blob");
}
