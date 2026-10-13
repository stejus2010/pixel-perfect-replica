import { useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCcw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONFIG } from "@/mc/config";
import { useSession } from "@/mc/session";
import { analyzeTap, classifyTaps, demoTaps, type TapEvent, type Target } from "@/mc/tap";
import { mean, sd, type TestResult } from "@/mc/types";
import { Btn, Card, Dialog, MetricRow, Notice, Page, QualityBadge, Ring, Stat, Stepper, TopBar } from "../ui";

export function TapScreen() {
  const s = useSession();
  const D = CONFIG.tap.durationS;
  const ev = useRef<TapEvent[]>([]);
  const t0 = useRef(0);
  const timer = useRef<number | null>(null);
  const [st, setSt] = useState<"idle" | "running" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [, force] = useState(0);
  const [mouseWarn, setMouseWarn] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  const stopTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const finish = (dur: number) => { stopTimer(); setResult(analyzeTap(ev.current, dur)); setSt("done"); };
  useEffect(() => {
    const vis = () => { if (document.hidden && timer.current) finish((performance.now() - t0.current) / 1000); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); stopTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = (e: React.PointerEvent, target: Target | null) => {
    if (st === "done") return;
    if (e.pointerType === "mouse" && !s.session.demo) { setMouseWarn(true); return; }
    if (st === "idle") {
      if (target !== "A") return;
      t0.current = e.timeStamp; ev.current = []; setSt("running");
      timer.current = window.setInterval(() => {
        const el = (performance.now() - t0.current) / 1000;
        setElapsed(el);
        if (el >= D) finish(D);
      }, 50);
    }
    ev.current.push({ t: e.timeStamp, target, pointerType: e.pointerType });
    force((n) => n + 1);
  };
  const reset = () => { stopTimer(); ev.current = []; setElapsed(0); setResult(null); setSt("idle"); };
  const demo = () => { reset(); ev.current = demoTaps(); setElapsed(D); finish(D); };
  const next = () => { s.setRaw("tap", { events: ev.current, durationS: Math.min(elapsed, D) || D }); s.go("processing"); };

  const { valid, iti } = classifyTaps(ev.current);
  const expected: Target = valid.at(-1)?.target === "A" ? "B" : "A";
  const cv = iti.length > 2 ? (100 * sd(iti)) / mean(iti) : null;

  const target = (t: Target) => (
    <button
      type="button"
      aria-label={`Target ${t === "A" ? "1" : "2"}${expected === t && st !== "done" ? ", tap next" : ""}`}
      onPointerDown={(e) => { e.stopPropagation(); handle(e, t); }}
      className={cn(
        "aspect-square w-full max-w-56 rounded-full transition-transform active:scale-95",
        t === "A" ? "bg-cyan" : "bg-violet",
        expected === t && st !== "done" ? (t === "A" ? "glow-cyan scale-100" : "glow-violet scale-100") : "scale-90 opacity-40",
      )}
    />
  );

  return (
    <Page>
      <TopBar onBack={() => { reset(); s.go("spiral"); }} />
      <Stepper current={4} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Tap Challenge</h1>
          <p className="mt-2 text-muted-foreground">Tap the two targets alternately, as accurately as possible, for 15 seconds. The timer starts with your first tap on the left target.</p>
        </div>
        <Ring remaining={st === "idle" ? D : Math.max(0, D - elapsed)} total={D} />
      </div>
      {mouseWarn && <Notice tone="warning" className="mt-4">Mouse clicks are not recorded in a real assessment. Please use touch, or enable developer demo mode on the home screen.</Notice>}
      <Card className="mt-5 touch-none select-none">
        <div className="grid grid-cols-2 place-items-center gap-6 py-8" onPointerDown={(e) => st === "running" && handle(e, null)}>
          {target("A")}
          {target("B")}
        </div>
        <p className="text-center text-sm text-muted-foreground" aria-live="polite">
          {st === "idle" ? "Tap the cyan target to begin" : st === "running" ? `Next: ${expected === "A" ? "cyan" : "violet"}` : "Test complete"}
        </p>
      </Card>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Valid taps">{valid.length}</Stat>
        <Stat label="Avg. inter-tap interval">{iti.length ? `${mean(iti).toFixed(0)} ms` : "—"}</Stat>
        <Stat label="Timing variability (CV)">{cv != null ? `${cv.toFixed(1)} %` : "—"}</Stat>
      </div>
      {result && (
        <Card className="mt-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Result</h2><QualityBadge status={result.status} /></div>
          {result.warnings.map((w) => <p key={w} className="text-sm text-warning">• {w}</p>)}
          <div className="mt-2 grid gap-x-8 sm:grid-cols-2">{result.metrics.map((m) => <MetricRow key={m.label} m={m} />)}</div>
        </Card>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {s.session.demo && st !== "running" && <Btn variant="secondary" onClick={demo}><Wand2 className="h-4 w-4" /> Run demo taps</Btn>}
        {st !== "idle" && <Btn variant="secondary" onClick={reset}><RotateCcw className="h-4 w-4" /> Retest</Btn>}
        {st === "done" && <Btn onClick={() => (result?.status === "invalid" ? setConfirm(true) : next())}>Analyse results <ArrowRight className="h-5 w-5" /></Btn>}
      </div>
      <Dialog open={confirm} title="Continue with invalid data?" body="The tap test will be marked as requiring a retest." confirmLabel="Continue anyway" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); next(); }} />
    </Page>
  );
}
