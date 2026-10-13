import { useEffect, useState } from "react";
import { BarChart3, Check, Info, Coffee, CircleDashed, Download, FileText, Home, Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyzeVoice } from "@/mc/audio";
import { CONFIG } from "@/mc/config";
import { analyzeMotion } from "@/mc/motion";
import { LIMITATIONS, summarize } from "@/mc/quality";
import { buildReportPdf } from "@/mc/report";
import { useSession } from "@/mc/session";
import { assessResults, CONSULTATION_GUIDANCE, EXCLUSION_TEXT, fmtScore, MEDICAL_DISCLAIMER, SCORE_LABEL, type TestScore } from "@/mc/scoring";
import { analyzeSpiral } from "@/mc/spiral";
import { analyzeTap } from "@/mc/tap";
import { caffeineSummary, contextNotes, type AssessmentContext } from "@/mc/context";
import { compareWithReference, nextStepFor, qualityText, REFERENCE_UNAVAILABLE_TITLE, TEST_EXPLANATIONS, type ReferenceComparison } from "@/mc/interpretation";
import { fmtValue, QUALITY_LABEL, TEST_NAMES, type TestResult } from "@/mc/types";
import { Btn, Card, MetricRow, Notice, Page, QualityBadge, Sparkline, Stepper, TopBar } from "../ui";

const tick = () => new Promise((r) => setTimeout(r, 0));
const nc = (id: TestResult["id"], explanation: string): TestResult => ({ id, name: TEST_NAMES[id], status: "not_completed", warnings: ["Test skipped or not completed."], metrics: [], explanation });

type Stage = { label: string; state: "pending" | "running" | "done" | "issue" };

export function ProcessingScreen() {
  const s = useSession();
  const [stages, setStages] = useState<Stage[]>(["Hand movement analysis", "Voice analysis", "Spiral analysis", "Tap analysis", "Data-quality review", "Report generation"].map((label) => ({ label, state: "pending" })));
  const [issues, setIssues] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    const set = (i: number, state: Stage["state"]) => !cancel && setStages((st) => st.map((x, k) => (k === i ? { ...x, state } : x)));
    (async () => {
      try {
        const R = s.session.raw;
        const out: TestResult[] = [];
        const step = async (i: number, fn: () => TestResult[]) => { set(i, "running"); await tick(); const r = fn(); out.push(...r); set(i, r.some((x) => x.status === "invalid" || x.status === "not_completed") ? "issue" : "done"); };
        await step(0, () => [
          R.rest ? analyzeMotion(R.rest, "rest", CONFIG.motion.durationS) : nc("rest", "Tablet movement while resting."),
          R.arm ? analyzeMotion(R.arm, "arm", CONFIG.motion.durationS) : nc("arm", "Tablet movement held close to the body."),
        ]);
        await step(1, () => [R.voice ? analyzeVoice(R.voice.frames, R.voice.durationS) : nc("voice", "Sustained vowel.")]);
        await step(2, () => [R.spiral ? analyzeSpiral(R.spiral) : nc("spiral", "Spiral tracing.")]);
        await step(3, () => [R.tap ? analyzeTap(R.tap.events, R.tap.durationS) : nc("tap", "Alternating taps.")]);
        set(4, "running"); await tick();
        const summary = summarize(out);
        set(4, summary.retest.length ? "issue" : "done");
        set(5, "running");
        const pdf = await buildReportPdf({ id: s.session.id, startedAt: s.session.startedAt, demo: s.session.demo, context: s.session.context, results: out, summary });
        set(5, "done");
        if (cancel) return;
        s.setAnalysis(out, summary, pdf);
        if (summary.retest.length) setIssues(summary.retest);
        else setTimeout(() => !cancel && s.go("results"), 700);
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page className="max-w-2xl">
      <TopBar />
      <div className="mt-6 text-center">
        <div className="relative mx-auto h-28 w-28">
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(var(--cyan),var(--violet),var(--cyan))] opacity-70 blur-md animate-spin [animation-duration:4s]" />
          <div className="absolute inset-2 grid place-items-center rounded-full bg-background"><BarChart3 className="h-10 w-10 text-cyan" /></div>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Analysing your results…</h1>
        <p className="mt-2 text-muted-foreground">All processing happens on this device.</p>
      </div>
      <Card className="mt-8 space-y-3">
        {stages.map((st) => (
          <div key={st.label} className="flex items-center gap-3">
            {st.state === "done" ? <Check className="h-5 w-5 text-cyan" /> : st.state === "running" ? <Loader2 className="h-5 w-5 animate-spin text-cyan" /> : st.state === "issue" ? <AlertTriangle className="h-5 w-5 text-warning" /> : <CircleDashed className="h-5 w-5 text-muted-foreground" />}
            <span className={cn(st.state === "pending" && "text-muted-foreground")}>{st.label}</span>
          </div>
        ))}
      </Card>
      {failed && <Notice tone="error" className="mt-4">Processing failed on this device. Please start a new assessment.</Notice>}
      {issues && (
        <>
          <Notice tone="warning" className="mt-4">These tests need a retest or were not completed: <b>{issues.join(", ")}</b>. Their values are not used for any summary.</Notice>
          <div className="mt-4 flex justify-end"><Btn onClick={() => s.go("results")}>View results</Btn></div>
        </>
      )}
    </Page>
  );
}

function groups(results: TestResult[]) {
  const by = (id: string) => results.find((r) => r.id === id)!;
  return [
    { title: "Hand Hold", items: [by("rest"), by("arm")] },
    { title: "Voice", items: [by("voice")] },
    { title: "Spiral", items: [by("spiral")] },
    { title: "Tap", items: [by("tap")] },
  ];
}

const KEY: Record<string, string> = { rest: "RMS amplitude", arm: "RMS amplitude", voice: "Mean pitch (F0)", spiral: "Mean deviation", tap: "Interval variability (CV)" };

function DownloadBtn({ variant = "secondary" as const }: { variant?: "primary" | "secondary" }) {
  const s = useSession();
  return <Btn variant={variant} onClick={() => s.downloadPdf()}><Download className="h-4 w-4" /> Download PDF</Btn>;
}

function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-label="Experimental score">
      {value != null && <div className="h-full rounded-full bg-[image:var(--gradient-primary)]" style={{ width: `${Math.max(2, value)}%` }} />}
    </div>
  );
}

export function ScoreInfo({ t }: { t: TestScore }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button type="button" aria-expanded={open} aria-label={`About the ${t.name} score scale`} onClick={() => setOpen((o) => !o)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <Info className="h-4 w-4" />
      </button>
      {open && <span role="note" className="absolute right-0 z-20 mt-1 block w-72 rounded-xl border border-border bg-popover p-3 text-left text-xs normal-case tracking-normal text-popover-foreground shadow-xl">{TEST_EXPLANATIONS[t.id].scaleInfo}</span>}
    </span>
  );
}

export function TestScoreCard({ t }: { t: TestScore }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">{t.name}<ScoreInfo t={t} /></div>
      <div className="mt-2 font-num text-3xl font-bold">{t.score != null ? <>{Math.round(t.score)}<span className="text-base font-normal text-muted-foreground">/100</span></> : <span className="text-lg">Insufficient data</span>}</div>
      <div className="mt-2"><ScoreBar value={t.score} /></div>
      <div className="mt-3"><QualityBadge status={t.quality} /></div>
      <p className="mt-2 text-xs text-muted-foreground">{t.featureDescription}</p>
      {t.features.map((f) => <div key={f.label} className="mt-1 text-sm text-muted-foreground">{f.label}: <span className="font-num text-foreground">{f.value.toFixed(f.digits)} {f.unit}</span></div>)}
      <p className="mt-2 text-xs text-muted-foreground">{t.explanation}</p>
      {(t.needsRetest || t.quality === "limited") && (
        <p className="mt-2 flex gap-1.5 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{t.needsRetest ? (t.exclusion ? `${EXCLUSION_TEXT[t.exclusion]}. Not included in the average.` : "Retest recommended.") : "Limited data quality — interpret with caution."}</p>
      )}
    </Card>
  );
}

function ContextCard({ c }: { c: AssessmentContext | null }) {
  return (
    <Card className="mt-4">
      <h2 className="flex items-center gap-2 font-semibold"><Coffee className="h-5 w-5 text-cyan" /> Assessment context</h2>
      {c && <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2"><div>Age: <b className="font-num">{c.age}</b></div><div>{caffeineSummary(c)}</div></div>}
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{contextNotes(c).map((n) => <li key={n}>• {n}</li>)}</ul>
    </Card>
  );
}

function ReferenceBlock({ cmp }: { cmp: ReferenceComparison[] }) {
  return (
    <div className="space-y-2">
      {cmp.map((c, i) => c.status === "invalid" ? (
        <p key={i} className="text-sm text-muted-foreground">{c.reason}</p>
      ) : c.status === "unavailable" ? (
        <div key={i} className="rounded-xl border border-dashed border-border p-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Your measured value — {c.featureLabel}</span><span className="font-num">{c.value != null ? `${c.value.toFixed(2)} ${c.unit}` : "Not available"}</span></div>
          <div className="mt-1 flex justify-between gap-3"><span className="text-muted-foreground">Reference range</span><span className="font-semibold">{REFERENCE_UNAVAILABLE_TITLE}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{c.reason}</p>
        </div>
      ) : (
        <div key={i} className="rounded-xl border border-border p-3 text-sm">
          <div className="flex justify-between"><span>{c.featureLabel}</span><span className="font-num">{c.value.toFixed(2)} {c.unit}</span></div>
          <div className="text-xs text-muted-foreground">{c.ref.source} · {c.ref.population}{c.ref.sampleSize ? ` · n=${c.ref.sampleSize}` : ""}</div>
          <p className="mt-1 text-xs">{c.interpretation}</p>
        </div>
      ))}
    </div>
  );
}

function Understanding({ tests, age }: { tests: TestScore[]; age: number | null }) {
  return (
    <>
      <h2 className="mt-8 text-xl font-semibold">Understanding Your Results</h2>
      <p className="mt-1 text-sm text-muted-foreground">Measured values are what the tablet recorded (with units). Experimental scores (0–100) are a conversion of those values and are not comparable across tests or with values in other units.</p>
      <div className="mt-3 space-y-3">
        {tests.map((t) => {
          const e = TEST_EXPLANATIONS[t.id];
          return (
            <details key={t.id} className="glass-raised group rounded-2xl p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold">{t.name}</span>
                <span className="font-num text-sm">{fmtScore(t.score)} · <span className="text-muted-foreground">{QUALITY_LABEL[t.quality]}</span></span>
              </summary>
              <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
                <div><h3 className="font-semibold">What this test measures</h3><p className="text-muted-foreground">{e.measures}</p></div>
                <div><h3 className="font-semibold">Your result</h3>
                  {t.features.length ? t.features.map((f) => <div key={f.label} className="text-muted-foreground">{f.label}: <span className="font-num text-foreground">{f.value.toFixed(f.digits)} {f.unit}</span></div>) : <p className="text-muted-foreground">No reliable measurement.</p>}
                  <div className="mt-1">Experimental score: <b className="font-num">{fmtScore(t.score)}</b></div>
                </div>
                <div><h3 className="font-semibold">What the score means</h3><p className="text-muted-foreground">{e.meaning}</p></div>
                <div><h3 className="font-semibold">Your Result vs Reference</h3><ReferenceBlock cmp={compareWithReference(t, age)} /></div>
                <div><h3 className="font-semibold">Data quality and limitations</h3><p>{qualityText(t)}</p><ul className="mt-1 text-muted-foreground">{[...t.warnings, ...e.limitations].map((l) => <li key={l}>• {l}</li>)}</ul></div>
                <div><h3 className="font-semibold">Recommended next step</h3><p className="text-muted-foreground">{nextStepFor(t)}</p></div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}

export function ResultsScreen() {
  const s = useSession();
  const { results, summary, startedAt, demo, context } = s.session;
  if (!results || !summary) return null;
  const a = assessResults(results);
  return (
    <Page>
      <TopBar exit={false} right={<><Btn variant="ghost" onClick={() => s.start()}><RotateCcw className="h-4 w-4" /> New Assessment</Btn><DownloadBtn /></>} />
      <Stepper current={5} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <h1 className="text-3xl font-bold">Your Results</h1>
        <span className="font-num text-sm text-muted-foreground">{startedAt.toLocaleString()}</span>
      </div>
      {demo && <Notice tone="warning" className="mt-4"><b>Demonstration data.</b> These results are generated from synthetic data and are not real measurements. They do not imply clinical validation.</Notice>}

      <Card className={cn("mt-5 border-2", a.status === "complete" ? "border-blue/50" : "border-warning/50")}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Tremor · Assessment Summary</div>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold">{a.status === "complete" ? <Check className="h-6 w-6 text-cyan" /> : <AlertTriangle className="h-6 w-6 text-warning" />}Status: {a.statusLabel}</h2>
            <p className="mt-2 text-muted-foreground">{a.interpretation}</p>
            <p className="mt-2 text-sm">Tests included: <b className="font-num">{a.eligibleCount} of {a.totalCount}</b>{a.retest.length > 0 && <> · <span className="text-warning">{a.retest.length} {a.retest.length === 1 ? "test requires" : "tests require"} a retest.</span></>}</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{SCORE_LABEL}</div>
            <div className="font-num text-6xl font-bold">{a.average != null ? <>{Math.round(a.average)}<span className="text-2xl font-normal text-muted-foreground">/100</span></> : <span className="text-2xl">Insufficient data</span>}</div>
            {a.average != null && a.status === "incomplete" && <div className="text-sm text-warning">Partial average — assessment incomplete</div>}
          </div>
        </div>
        {a.excluded.length > 0 && (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            <div className="font-semibold">Excluded from the average</div>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">{a.excluded.map((t) => <li key={t.id}>• {t.name}: {t.exclusion && EXCLUSION_TEXT[t.exclusion]}</li>)}</ul>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">0 = lower measured deviation or variability, 100 = higher. A low score does not mean you are healthy; a high score does not mean you have a disease. Not a Parkinson's risk score or probability.</p>
      </Card>
      <ContextCard c={context} />

      <h2 className="mt-8 text-xl font-semibold">Individual Test Results</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {a.tests.map((t) => <TestScoreCard key={t.id} t={t} />)}
      </div>
      <Understanding tests={a.tests} age={context?.age ?? null} />

      <h2 className="mt-8 text-xl font-semibold">Recommended Next Steps</h2>
      <Card className="mt-3">
        <ul className="space-y-1.5 text-sm">{a.nextSteps.map((n) => <li key={n}>• {n}</li>)}</ul>
        {a.retest.length > 0 && <div className="mt-4"><Btn variant="secondary" onClick={() => s.start()}><RotateCcw className="h-4 w-4" /> Start a new assessment to retest</Btn></div>}
      </Card>
      <Notice className="mt-4">{CONSULTATION_GUIDANCE}</Notice>
      <Notice className="mt-3">{MEDICAL_DISCLAIMER}</Notice>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Btn variant="secondary" onClick={() => s.go("details")}><BarChart3 className="h-4 w-4" /> View detailed results</Btn>
        <Btn variant="secondary" onClick={() => s.go("report")}><FileText className="h-4 w-4" /> Preview report</Btn>
        <Btn onClick={() => s.go("complete")}>Finish</Btn>
      </div>
    </Page>
  );
}

export function DetailsScreen() {
  const s = useSession();
  const { results } = s.session;
  if (!results) return null;
  return (
    <Page>
      <TopBar onBack={() => s.go("results")} exit={false} right={<DownloadBtn />} />
      <h1 className="text-3xl font-bold">Detailed Results</h1>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {groups(results).map((g) => (
          <Card key={g.title}>
            <h2 className="text-lg font-semibold">{g.title}</h2>
            {g.items.map((r) => (
              <div key={r.id} className="mt-3">
                {g.items.length > 1 && <h3 className="text-sm font-semibold text-cyan">{r.name}</h3>}
                <div className="mt-1 flex items-center justify-between gap-3"><QualityBadge status={r.status} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{r.explanation}</p>
                {r.series && r.series.length > 1 && <div className="mt-2"><Sparkline values={r.series} /></div>}
                {r.warnings.map((w) => <p key={w} className="text-xs text-warning">• {w}</p>)}
                <div className="mt-2">{r.metrics.length ? r.metrics.map((m) => <MetricRow key={m.label} m={m} />) : <p className="text-sm text-muted-foreground">Not available</p>}</div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </Page>
  );
}

export function ReportScreen() {
  const s = useSession();
  const { results, summary, id, startedAt, demo, context } = s.session;
  if (!results || !summary) return null;
  return (
    <Page className="max-w-4xl">
      <TopBar onBack={() => s.go("results")} exit={false} right={<DownloadBtn variant="primary" />} />
      <article className="rounded-2xl bg-paper p-6 text-paper-foreground shadow-2xl sm:p-10">
        <header className="border-b border-paper-border pb-4">
          <h1 className="text-2xl font-bold">Tremor · Movement Assessment Report</h1>
          <p className="text-sm text-paper-muted">Developed by Kinetiq</p>
          {demo && <p className="mt-1 font-bold text-warning">DEMO — synthetic data, not real measurements</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-paper-muted sm:grid-cols-3">
            <div>Date<br /><span className="text-paper-foreground">{startedAt.toLocaleString()}</span></div>
            <div>Session ID<br /><span className="font-num text-paper-foreground">{id}</span></div>
            <div>Status<br /><span className="text-paper-foreground">{assessResults(results).statusLabel}</span></div>
            <div>{SCORE_LABEL}<br /><span className="font-num text-paper-foreground">{fmtScore(assessResults(results).average)} · {assessResults(results).eligibleCount} of 4 tests</span></div>
            <div>Age<br /><span className="font-num text-paper-foreground">{context ? context.age : "Not recorded"}</span></div>
            <div className="col-span-2">Recent caffeine<br /><span className="text-paper-foreground">{context ? caffeineSummary(context) : "Not recorded"}</span></div>
          </div>
        </header>
        <p className="mt-4 text-sm text-paper-muted">{assessResults(results).interpretation}</p>
        <section className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {assessResults(results).tests.map((t) => <div key={t.id} className="flex justify-between border-b border-paper-border py-1"><span>{t.name}</span><span className="font-num">{fmtScore(t.score)}{t.exclusion ? ` — ${EXCLUSION_TEXT[t.exclusion]}` : ""}</span></div>)}
        </section>
        {results.map((r) => (
          <section key={r.id} className="mt-5 border-t border-paper-border pt-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{r.name}</h2><span className="text-sm text-paper-muted">{QUALITY_LABEL[r.status]}</span></div>
            {r.warnings.map((w) => <p key={w} className="text-xs text-paper-muted">! {w}</p>)}
            <table className="mt-2 w-full text-sm"><tbody>
              {r.metrics.map((m) => <tr key={m.label} className="border-b border-paper-border last:border-0"><td className="py-1 text-paper-muted">{m.label}</td><td className="py-1 text-right font-num">{fmtValue(m)}{fmtValue(m) !== "Not available" ? ` ${m.unit}` : ""}</td></tr>)}
              {!r.metrics.length && <tr><td className="py-1 text-paper-muted">No measurements available.</td></tr>}
            </tbody></table>
          </section>
        ))}
        <section className="mt-6 border-t border-paper-border pt-4 text-sm">
          <h2 className="font-semibold">Important limitations</h2>
          <ul className="mt-1 list-disc pl-5 text-paper-muted">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-3">{CONSULTATION_GUIDANCE}</p>
          <p className="mt-3 font-semibold">{MEDICAL_DISCLAIMER}</p>
          <p className="mt-3 text-xs text-paper-muted">Tremor | Developed by Kinetiq</p>
        </section>
      </article>
    </Page>
  );
}

export function CompleteScreen() {
  const s = useSession();
  return (
    <Page className="max-w-2xl">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center py-4">
        <span className="text-lg font-bold">Tremor</span>
        <Btn variant="ghost" aria-label="Return home" onClick={() => s.endSession("welcome")}><Home className="h-5 w-5" /></Btn>
      </header>
      <div className="mt-10 text-center">
        <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-[image:var(--gradient-primary)] glow-cyan"><Check className="h-14 w-14 text-primary-foreground" strokeWidth={3} /></div>
        <h1 className="mt-8 text-3xl font-bold">Assessment Complete</h1>
        <p className="mt-2 text-muted-foreground">Your report is ready.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <DownloadBtn variant="primary" />
          <Btn variant="secondary" onClick={() => s.start()}><RotateCcw className="h-4 w-4" /> New Assessment</Btn>
          <Btn variant="secondary" onClick={() => s.endSession("welcome")}><Home className="h-4 w-4" /> Return Home</Btn>
        </div>
      </div>
      <Notice className="mt-10">{MEDICAL_DISCLAIMER}</Notice>
    </Page>
  );
}
