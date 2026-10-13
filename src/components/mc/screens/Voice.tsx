import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mic, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyzeVoice, demoSource, detectPitch, frameStats, MicFailure, openMic, toDb, type AudioSource, type VoiceFrame } from "@/mc/audio";
import { CONFIG } from "@/mc/config";
import { useSession } from "@/mc/session";
import type { TestResult } from "@/mc/types";
import { Btn, Card, Dialog, MetricRow, Notice, Page, QualityBadge, Sparkline, Stepper, TopBar } from "../ui";

type St = "idle" | "requesting" | "recording" | "done" | "denied" | "no_device" | "unsupported" | "error";

export function VoiceScreen() {
  const s = useSession();
  const D = CONFIG.voice.durationS;
  const src = useRef<AudioSource | null>(null);
  const frames = useRef<VoiceFrame[]>([]);
  const raf = useRef(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const t0 = useRef(0);
  const dur = useRef(0);
  const [st, setSt] = useState<St>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [hist, setHist] = useState<{ f0: number[]; db: number[] }>({ f0: [], db: [] });
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState<null | "skip" | "invalid">(null);

  const cleanup = () => { cancelAnimationFrame(raf.current); src.current?.stop(); src.current = null; };
  const finish = () => {
    if (!src.current) return;
    cleanup();
    setResult(analyzeVoice(frames.current, dur.current));
    setSt("done");
  };
  useEffect(() => {
    const vis = () => { if (document.hidden) finish(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setSt("requesting");
    try { src.current = s.session.demo ? demoSource() : await openMic(); }
    catch (e) { setSt(e instanceof MicFailure ? e.kind : "error"); return; }
    frames.current = []; setResult(null); setHist({ f0: [], db: [] });
    const buf = new Float32Array(2048);
    const css = getComputedStyle(document.documentElement);
    const c1 = css.getPropertyValue("--cyan"), c2 = css.getPropertyValue("--violet");
    let n = 0, lastUi = 0;
    t0.current = performance.now();
    setSt("recording");
    const loop = () => {
      const a = src.current;
      if (!a) return;
      a.read(buf);
      const now = performance.now();
      const e = (now - t0.current) / 1000;
      dur.current = e;
      if (n++ % 3 === 0) {
        const { rms, peak } = frameStats(buf);
        frames.current.push({ t: now, rms, peak, f0: detectPitch(buf, a.sampleRate) });
      }
      const c = cv.current;
      if (c) {
        const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
        if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
        const g = c.getContext("2d")!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
        const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, c1); grad.addColorStop(1, c2);
        g.strokeStyle = grad; g.lineWidth = 1.5; g.beginPath();
        for (let i = 0; i < buf.length; i += 4) { const x = (i / buf.length) * w, y = h / 2 - buf[i] * h * 1.2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      if (now - lastUi > 100) {
        lastUi = now; setElapsed(e);
        const fr = frames.current;
        setHist({ f0: fr.filter((f) => f.f0).map((f) => f.f0!).slice(-60), db: fr.map((f) => toDb(f.rms)).slice(-60) });
      }
      if (e >= D) return finish();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  const next = () => { s.setRaw("voice", { frames: frames.current, durationS: dur.current }); s.go("spiral"); };
  const err: Partial<Record<St, string>> = {
    denied: "Microphone access was denied. Allow microphone access in your browser settings, then try again.",
    no_device: "No microphone was found on this device.",
    unsupported: "This browser does not support microphone recording.",
    error: "The microphone could not be started. Close other apps using it and try again.",
  };
  const lastF0 = hist.f0.at(-1), lastDb = hist.db.at(-1);

  return (
    <Page>
      <TopBar onBack={() => { cleanup(); s.go("arm"); }} />
      <Stepper current={2} />
      <h1 className="text-3xl font-bold">Voice Test</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Take a comfortable breath and say ‘ahhh’ at a steady, comfortable volume for approximately five seconds.</p>
      {st === "idle" && <Notice className="mt-4">Tapping the microphone will ask for microphone permission. Audio is analysed on this device and never stored or uploaded.</Notice>}
      {err[st] && <Notice tone="error" className="mt-4">{err[st]}</Notice>}
      <div className="mt-6 grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center gap-3 px-6">
          <button
            type="button"
            onClick={st === "recording" ? finish : start}
            disabled={st === "requesting"}
            aria-label={st === "recording" ? "Stop recording" : "Start recording"}
            className={cn("grid h-36 w-36 place-items-center rounded-full border-2 border-cyan/60 bg-raised transition focus-visible:outline-2 focus-visible:outline-ring", st === "recording" ? "glow-cyan animate-soft-pulse" : "hover:glow-cyan")}
          >
            {st === "recording" ? <Square className="h-12 w-12 text-cyan" /> : <Mic className="h-14 w-14 text-cyan" />}
          </button>
          <div className="text-sm text-muted-foreground">{st === "recording" ? "Recording…" : st === "done" ? "Recorded" : "Tap to record"}</div>
          <div className="font-num text-2xl font-bold">{Math.min(elapsed, D).toFixed(1)} / {D} s</div>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-raised"><div className="h-full bg-cyan" style={{ width: `${Math.min(100, (elapsed / D) * 100)}%` }} /></div>
        </div>
        <Card>
          <div className="mb-2 text-sm font-medium">Live audio signal</div>
          <canvas ref={cv} className="h-40 w-full" aria-label="Live audio waveform" />
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card><div className="text-xs text-muted-foreground">Pitch (Hz)</div><Sparkline values={hist.f0} /><div className="font-num text-lg font-semibold">{lastF0 ? lastF0.toFixed(0) + " Hz" : "Unavailable"}</div></Card>
        <Card><div className="text-xs text-muted-foreground">Level (dBFS, uncalibrated)</div><Sparkline values={hist.db} color="var(--violet)" /><div className="font-num text-lg font-semibold">{lastDb != null ? lastDb.toFixed(0) + " dBFS" : "Unavailable"}</div></Card>
      </div>
      {result && (
        <Card className="mt-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Recording result</h2><QualityBadge status={result.status} /></div>
          {result.warnings.map((w) => <p key={w} className="text-sm text-warning">• {w}</p>)}
          <div className="mt-2 grid gap-x-8 sm:grid-cols-2">{result.metrics.map((m) => <MetricRow key={m.label} m={m} />)}</div>
        </Card>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {err[st] && <Btn variant="secondary" onClick={() => setConfirm("skip")}>Skip test</Btn>}
        {st === "done" && (
          <>
            <Btn variant="secondary" onClick={start}><RotateCcw className="h-4 w-4" /> Retest</Btn>
            <Btn onClick={() => (result?.status === "invalid" ? setConfirm("invalid") : next())}>Continue <ArrowRight className="h-5 w-5" /></Btn>
          </>
        )}
      </div>
      <Dialog
        open={confirm !== null}
        title={confirm === "skip" ? "Skip the voice test?" : "Continue with invalid data?"}
        body={confirm === "skip" ? "The voice test will be marked as not completed." : "The voice test will be marked as requiring a retest."}
        confirmLabel={confirm === "skip" ? "Skip" : "Continue anyway"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); if (confirm === "skip") { s.skip("voice"); s.go("spiral"); } else next(); }}
      />
    </Page>
  );
}
