import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play, RotateCcw, Square } from "lucide-react";
import { CONFIG } from "@/mc/config";
import { analyzeMotion, hasValues, listenDemoMotion, listenMotion, liveStats, requestMotionPermission, toAxes, type MotionSample } from "@/mc/motion";
import { useSession } from "@/mc/session";
import type { TestResult } from "@/mc/types";
import { Btn, Card, Dialog, MetricRow, Notice, Page, QualityBadge, Ring, Stat, Stepper, TopBar } from "../ui";

function LiveChart({ data, active }: { data: React.RefObject<MotionSample[]>; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const css = getComputedStyle(document.documentElement);
    const cols = ["--cyan", "--blue", "--violet"].map((v) => css.getPropertyValue(v));
    const grid = css.getPropertyValue("--border"), txt = css.getPropertyValue("--muted-foreground");
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const L = 36, B = 18, pw = w - L - 4, ph = h - B - 4;
      const all = data.current ?? [];
      const t0 = all.find(hasValues)?.t ?? 0;
      const win = all.filter((s) => s.t - t0 <= CONFIG.motion.durationS * 1000);
      const { t, axes } = toAxes(win);
      let max = 0.5;
      axes.forEach((a) => a.forEach((v) => (max = Math.max(max, Math.abs(v)))));
      max = Math.ceil(max * 10) / 10;
      g.font = "10px JetBrains Mono, monospace"; g.fillStyle = txt; g.strokeStyle = grid; g.lineWidth = 1;
      [-max, 0, max].forEach((v) => { const y = 2 + ph / 2 - (v / max) * (ph / 2); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.fillText(v.toFixed(1), 2, y + 3); });
      for (let s = 0; s <= 15; s += 5) g.fillText(`${s}s`, L + (s / 15) * pw - 6, h - 4);
      const stride = Math.max(1, Math.ceil(t.length / 600));
      axes.forEach((a, k) => {
        g.strokeStyle = cols[k]; g.lineWidth = 1.2; g.beginPath();
        for (let i = 0; i < a.length; i += stride) {
          const x = L + ((t[i] - t0 / 1000) / 15) * pw, y = 2 + ph / 2 - (a[i] / max) * (ph / 2);
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      });
      if (active) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, data]);
  return <canvas ref={ref} className="h-56 w-full" aria-label="Live accelerometer signal in metres per second squared, X Y Z axes" />;
}

type St = "idle" | "requesting" | "recording" | "done" | "unavailable" | "denied";

export function HandHoldScreen({ phase }: { phase: "rest" | "arm" }) {
  const s = useSession();
  const D = CONFIG.motion.durationS;
  const samples = useRef<MotionSample[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const timer = useRef<number | null>(null);
  const t0 = useRef(0);
  const [st, setSt] = useState<St>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<{ rate: number | null; amp: number | null }>({ rate: null, amp: null });
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState<null | "skip" | "invalid">(null);

  const cleanup = () => { stopRef.current?.(); stopRef.current = null; if (timer.current) clearInterval(timer.current); timer.current = null; };
  const finish = () => { cleanup(); setResult(analyzeMotion(samples.current, phase, D)); setSt("done"); };
  useEffect(() => {
    const vis = () => { if (document.hidden && timer.current) finish(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setSt("requesting");
    const perm = s.session.demo ? "granted" : await requestMotionPermission();
    if (perm === "denied") return setSt("denied");
    if (perm === "unsupported") return setSt("unavailable");
    samples.current = []; setResult(null); setElapsed(0); t0.current = performance.now();
    stopRef.current = s.session.demo ? listenDemoMotion((p) => samples.current.push(p), phase === "rest" ? 0.03 : 0.07) : listenMotion((p) => samples.current.push(p));
    setSt("recording");
    timer.current = window.setInterval(() => {
      const e = (performance.now() - t0.current) / 1000;
      setElapsed(e); setLive(liveStats(samples.current));
      if (e * 1000 > CONFIG.motion.noDataTimeoutMs && !samples.current.some(hasValues)) { cleanup(); setSt("unavailable"); return; }
      if (e >= D) finish();
    }, 100);
  };

  const next = () => { s.setRaw(phase, samples.current); s.go(phase === "rest" ? "arm" : "voice"); };
  const onContinue = () => (result?.status === "invalid" ? setConfirm("invalid") : next());

  const title = phase === "rest" ? "Hand Hold — Resting" : "Hand Hold — Arm Out";
  const instr = phase === "rest"
    ? "Sit at a table. Rest your forearm on the table and hold the tablet lightly in that hand, with its lower edge supported on the table. Keep still and relaxed for 15 seconds."
    : "Stay seated. Hold the tablet with both hands close to your chest, elbows bent and tucked against your sides. Do not stretch your arms out. Keep it as steady as you can for 15 seconds.";
  const liveQ = live.rate == null ? null : live.rate < CONFIG.motion.minRateHz ? "invalid" : live.rate < CONFIG.motion.spectralMinRateHz ? "limited" : "valid";

  return (
    <Page>
      <TopBar onBack={() => { cleanup(); s.go(phase === "rest" ? "instructions" : "rest"); }} />
      <Stepper current={1} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{instr}</p>
          <p className="mt-2 text-xs text-muted-foreground">This measures movement of the tablet in this position, not hand tremor directly. Stop if you feel any discomfort or the tablet feels too heavy.</p>
        </div>
        <Ring remaining={st === "recording" ? D - elapsed : st === "done" ? 0 : D} total={D} />
      </div>
      {st === "unavailable" && <Notice tone="warning" className="mt-4"><b>Sensor unavailable.</b> This browser or device does not provide motion data. Use a tablet or phone with a motion sensor, or skip this test (it will be marked not completed).</Notice>}
      {st === "denied" && <Notice tone="error" className="mt-4"><b>Motion access denied.</b> Allow motion & orientation access in your browser settings, then try again.</Notice>}
      <Card className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Accelerometer signal (m/s²)</span>
          <span className="flex gap-3 text-xs text-muted-foreground"><span className="text-cyan">● X</span><span className="text-blue">● Y</span><span className="text-violet">● Z</span></span>
        </div>
        <LiveChart data={samples} active={st === "recording"} />
      </Card>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Sampling rate">{live.rate ? `~${live.rate.toFixed(0)} Hz` : "—"}</Stat>
        <Stat label="Signal quality"><QualityBadge status={st === "done" ? result!.status : liveQ} label={st === "done" ? undefined : liveQ ? undefined : "Waiting"} /></Stat>
        <Stat label="Current amplitude">{live.amp != null ? `${live.amp.toFixed(3)} m/s²` : "—"}</Stat>
      </div>
      {result && (
        <Card className="mt-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Phase result</h2><QualityBadge status={result.status} /></div>
          {result.warnings.map((w) => <p key={w} className="text-sm text-warning">• {w}</p>)}
          <div className="mt-2 grid gap-x-8 sm:grid-cols-2">{result.metrics.map((m) => <MetricRow key={m.label} m={m} />)}</div>
        </Card>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {(st === "unavailable" || st === "denied") && <Btn variant="secondary" onClick={() => setConfirm("skip")}>Skip test</Btn>}
        {st === "recording" ? (
          <Btn variant="secondary" onClick={finish}><Square className="h-4 w-4" /> Stop</Btn>
        ) : st === "done" ? (
          <>
            <Btn variant="secondary" onClick={start}><RotateCcw className="h-4 w-4" /> Retest</Btn>
            <Btn onClick={onContinue}>Continue <ArrowRight className="h-5 w-5" /></Btn>
          </>
        ) : (
          <Btn onClick={start} disabled={st === "requesting"}><Play className="h-4 w-4" /> {st === "idle" ? "Start" : "Try again"}</Btn>
        )}
      </div>
      <Dialog
        open={confirm !== null}
        title={confirm === "skip" ? "Skip this test?" : "Continue with invalid data?"}
        body={confirm === "skip" ? "This phase will be marked as not completed, and the assessment will be incomplete." : "This phase will be marked as requiring a retest. You can retest now instead."}
        confirmLabel={confirm === "skip" ? "Skip" : "Continue anyway"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); if (confirm === "skip") { s.skip(phase); s.go(phase === "rest" ? "arm" : "voice"); } else next(); }}
      />
    </Page>
  );
}
