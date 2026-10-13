import { LIMITATIONS, type Summary } from "./quality";
import { assessResults, CONSULTATION_GUIDANCE, EXCLUSION_TEXT, fmtScore, MEDICAL_DISCLAIMER, SCORE_LABEL } from "./scoring";
import { caffeineSummary, contextNotes, type AssessmentContext } from "./context";
import { compareWithReference, nextStepFor, qualityText, REFERENCE_UNAVAILABLE_TITLE, TEST_EXPLANATIONS } from "./interpretation";
import { fmtValue, QUALITY_LABEL, type TestResult } from "./types";

const clean = (s: string) =>
  s.replace(/²/g, "^2").replace(/[—–]/g, "-").replace(/…/g, "...").replace(/°/g, " deg")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, "");

export interface ReportInput { id: string; startedAt: Date; demo: boolean; context?: AssessmentContext | null; results: TestResult[]; summary: Summary }

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

  doc.setFillColor(11, 27, 43);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(36, 221, 245);
  doc.rect(0, 30, W, 1.2, "F");
  doc.setTextColor(243, 247, 252);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Tremor", M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Team Kinetiq", W - M, 14, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(r.demo ? "Movement Assessment Report - DEMO (synthetic data)" : "Movement Assessment Report - experimental prototype", M, 22);
  y = 40;

  text(`Date: ${r.startedAt.toLocaleString()}`, 10);
  text(`Anonymous session ID: ${r.id}`, 10);
  if (r.demo) text("DEMO MODE: all values below are synthetic and are NOT real measurements.", 10, true, [180, 83, 9]);
  y += 3;
  text("Assessment context", 13, true);
  text(`Age: ${r.context ? r.context.age : "Not recorded"}`, 10);
  text(`Recent caffeine: ${r.context ? caffeineSummary(r.context) : "Not recorded"}`, 10);
  contextNotes(r.context ?? null).forEach((n) => text(n, 9, false, muted));
  y += 3;
  const A = assessResults(r.results);
  text("Assessment summary", 13, true);
  text(`Status: ${A.statusLabel}`, 11, true);
  text(`${SCORE_LABEL}: ${fmtScore(A.average)}${A.average != null && A.status === "incomplete" ? " (partial average - assessment incomplete)" : ""}`, 11, true);
  text(`Tests included: ${A.eligibleCount} of ${A.totalCount}  |  Excluded: ${A.excluded.length}`, 10);
  text(A.interpretation, 10, false, muted);
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
    doc.text(clean(`Tremor | Developed by Kinetiq  -  ${r.id}  -  Not a medical diagnosis  -  Page ${i}/${pages}`), M, 290);
  }
  return doc.output("blob");
}
