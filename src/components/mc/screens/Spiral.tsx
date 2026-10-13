import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eraser, Wand2 } from "lucide-react";
import { useSession } from "@/mc/session";
import { analyzeSpiral, demoSpiral, refSpiral, type SpiralPoint } from "@/mc/spiral";
import { CONFIG } from "@/mc/config";
import { getMetric, type TestResult } from "@/mc/types";
import { Btn, Card, Dialog, MetricRow, Page, QualityBadge, Stepper, TopBar } from "../ui";

const REF = refSpiral(500);
const refPath = REF.map((p, i) => `${i ? "L" : "M"}${p.x * 100},${p.y * 100}`).join(" ");

export function SpiralScreen() {
  const s = useSession();
  const cv = useRef<HTMLCanvasElement>(null);
  const pts = useRef<SpiralPoint[]>([]);
  const stroke = useRef(0);
  const drawing = useRef(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  const redraw = () => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth;
    c.width = w * dpr; c.height = w * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    g.strokeStyle = css.getPropertyValue("--blue"); g.globalAlpha = 0.45; g.lineWidth = 10; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); REF.forEach((p, i) => (i ? g.lineTo(p.x * w, p.y * w) : g.moveTo(p.x * w, p.y * w))); g.stroke();
    g.globalAlpha = 1; g.strokeStyle = css.getPropertyValue("--cyan"); g.lineWidth = 3;
    const P = pts.current;
    g.beginPath();
    P.forEach((p, i) => (i && P[i - 1].stroke === p.stroke ? g.lineTo(p.x * w, p.y * w) : g.moveTo(p.x * w, p.y * w)));
    g.stroke();
  };
  useEffect(() => {
    redraw();
    const ro = new ResizeObserver(redraw);
    if (cv.current) ro.observe(cv.current);
    return () => ro.disconnect();
  }, []);

  const add = (e: PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    pts.current.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: e.timeStamp, stroke: stroke.current });
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true; stroke.current++;
    add(e.nativeEvent); redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const list = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    (list.length ? list : [e.nativeEvent]).forEach(add);
    redraw();
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; setResult(analyzeSpiral(pts.current)); };
  const clear = () => { pts.current = []; stroke.current = 0; setResult(null); redraw(); };
  const demo = () => { pts.current = demoSpiral(); setResult(analyzeSpiral(pts.current)); redraw(); };
  const next = () => { s.setRaw("spiral", pts.current); s.go("tap"); };
  const bar = (v: number | null, max: number) => <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full bg-cyan" style={{ width: `${v == null ? 0 : Math.max(0, Math.min(100, (v / max) * 100))}%` }} /></div>;
  const cov = getMetric(result ?? undefined, "Completion (coverage)");

  return (
    <Page>
      <TopBar onBack={() => s.go("voice")} />
      <Stepper current={3} />
      <h1 className="text-3xl font-bold">Spiral Test</h1>
      <p className="mt-2 text-muted-foreground">Use your finger or a stylus to trace the spiral from the centre outwards. Stay on the line and draw at a steady pace.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
        <Card className="p-3">
          <canvas
            ref={cv}
            className="mx-auto block aspect-square w-full max-w-[min(100%,70vh)] touch-none select-none rounded-xl bg-surface"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            aria-label="Spiral drawing area"
          />
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <div className="text-sm font-medium">Reference spiral</div>
            <svg viewBox="0 0 100 100" className="mx-auto mt-2 h-28 w-28" aria-hidden><path d={refPath} fill="none" stroke="var(--cyan)" strokeWidth="1.5" /></svg>
          </Card>
          <Card className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="font-medium">Progress</span><QualityBadge status={result?.status ?? null} label={result ? undefined : "Not started"} /></div>
            <div>Completion <span className="float-right font-num">{cov != null ? `${cov.toFixed(0)}%` : "—"}</span>{bar(cov, 100)}</div>
            <div className="text-xs text-muted-foreground">Needs ≥ {CONFIG.spiral.minCoverageValid * 100}% of the spiral traced for a valid result.</div>
          </Card>
        </div>
      </div>
      {result && result.metrics.length > 0 && (
        <Card className="mt-4">
          {result.warnings.map((w) => <p key={w} className="text-sm text-warning">• {w}</p>)}
          <div className="mt-2 grid gap-x-8 sm:grid-cols-2">{result.metrics.slice(0, 6).map((m) => <MetricRow key={m.label} m={m} />)}</div>
        </Card>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {s.session.demo && <Btn variant="secondary" onClick={demo}><Wand2 className="h-4 w-4" /> Insert demo path</Btn>}
        <Btn variant="secondary" onClick={clear}><Eraser className="h-4 w-4" /> Clear</Btn>
        <Btn disabled={!result} onClick={() => (result?.status === "invalid" ? setConfirm(true) : next())}>Next <ArrowRight className="h-5 w-5" /></Btn>
      </div>
      <Dialog open={confirm} title="Spiral incomplete" body="The spiral will be marked as requiring a retest. Clear and draw again, or continue." confirmLabel="Continue anyway" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); next(); }} />
    </Page>
  );
}
