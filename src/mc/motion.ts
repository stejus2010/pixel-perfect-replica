import { CONFIG } from "./config";
import { downsample, mean, median, sd, type TestResult, TEST_NAMES } from "./types";

export interface MotionSample {
  t: number; // performance.now() ms (monotonic)
  ax: number | null; ay: number | null; az: number | null;
  gx: number | null; gy: number | null; gz: number | null;
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const hasValues = (s: MotionSample) =>
  (s.ax != null && s.ay != null && s.az != null) || (s.gx != null && s.gy != null && s.gz != null);

export async function requestMotionPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || typeof (window as any).DeviceMotionEvent === "undefined") return "unsupported";
  const DME = (window as any).DeviceMotionEvent;
  if (typeof DME.requestPermission === "function") {
    try {
      return (await DME.requestPermission()) === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}

export function listenMotion(cb: (s: MotionSample) => void): () => void {
  const h = (e: DeviceMotionEvent) => {
    const a = e.acceleration, g = e.accelerationIncludingGravity;
    cb({ t: performance.now(), ax: num(a?.x), ay: num(a?.y), az: num(a?.z), gx: num(g?.x), gy: num(g?.y), gz: num(g?.z) });
  };
  window.addEventListener("devicemotion", h);
  return () => window.removeEventListener("devicemotion", h);
}

/** DEMO ONLY: synthetic ~100 Hz signal. Never used in real assessment mode. */
export function listenDemoMotion(cb: (s: MotionSample) => void, amp: number): () => void {
  const t0 = performance.now();
  const id = window.setInterval(() => {
    const t = performance.now();
    const s = (t - t0) / 1000;
    const w = amp * Math.sin(2 * Math.PI * 5 * s);
    const n = () => (Math.random() - 0.5) * amp * 0.8;
    cb({ t, ax: w + n(), ay: 0.6 * w + n(), az: n(), gx: null, gy: null, gz: null });
  }, 10);
  return () => clearInterval(id);
}

/** Linear acceleration if exposed, otherwise gravity-included with the mean removed. */
export function toAxes(samples: MotionSample[]) {
  const v = samples.filter(hasValues);
  const linear = v.length > 0 && v.filter((s) => s.ax != null).length >= v.length * 0.9;
  const pick = (s: MotionSample, k: 0 | 1 | 2) =>
    linear ? ([s.ax, s.ay, s.az][k] ?? 0) : ([s.gx, s.gy, s.gz][k] ?? 0);
  const axes = [0, 1, 2].map((k) => {
    const raw = v.map((s) => pick(s, k as 0 | 1 | 2));
    const m = mean(raw) || 0;
    return raw.map((x) => x - m);
  });
  return { t: v.map((s) => s.t / 1000), axes, linear, validCount: v.length };
}

export function liveStats(samples: MotionSample[]) {
  const now = samples.at(-1)?.t;
  if (now == null) return { rate: null as number | null, amp: null as number | null };
  const win = samples.filter((s) => s.t > now - 1000 && hasValues(s));
  if (win.length < 3) return { rate: null, amp: null };
  const iv = win.slice(1).map((s, i) => s.t - win[i].t).filter((d) => d > 0);
  const { axes } = toAxes(win);
  const mag = axes[0].map((_, i) => Math.hypot(axes[0][i], axes[1][i], axes[2][i]));
  return { rate: iv.length ? 1000 / median(iv) : null, amp: Math.sqrt(mean(mag.map((m) => m * m))) };
}

function spectrum(t: number[], v: number[], fMin: number, fMax: number, step = 0.1) {
  const out: { f: number; p: number }[] = [];
  for (let f = fMin; f <= fMax + 1e-9; f += step) {
    const w = 2 * Math.PI * f;
    let re = 0, im = 0;
    for (let i = 0; i < v.length; i++) {
      re += v[i] * Math.cos(w * t[i]);
      im -= v[i] * Math.sin(w * t[i]);
    }
    out.push({ f, p: re * re + im * im });
  }
  return out;
}

export function analyzeMotion(samples: MotionSample[], id: "rest" | "arm", targetS: number): TestResult {
  const C = CONFIG.motion;
  const explanation =
    id === "rest"
      ? "Movement of the tablet itself while resting in a supported hand. Describes device motion under this setup, not a direct measurement of hand tremor."
      : "Movement of the tablet held close to the body at chest height. Not directly comparable to the resting phase if position or orientation changed.";
  const warnings: string[] = [];
  const { t, axes, linear, validCount } = toAxes(samples);
  const missing = samples.length - validCount;
  const base = { id, name: TEST_NAMES[id], explanation };

  if (validCount < 10) {
    return { ...base, status: samples.length ? "invalid" : "not_completed", warnings: ["Sensor unavailable or insufficient data."], metrics: [] };
  }
  const duration = t[t.length - 1] - t[0];
  const iv = t.slice(1).map((x, i) => x - t[i]).filter((d) => d > 0);
  const medIv = median(iv);
  const rate = 1 / medIv;
  const jitter = sd(iv) / mean(iv);
  const mag = axes[0].map((_, i) => Math.hypot(axes[0][i], axes[1][i], axes[2][i]));
  const rms = Math.sqrt(mean(mag.map((m) => m * m)));
  const peak = Math.max(...mag);

  let status: TestResult["status"] = "valid";
  if (duration < targetS * 0.8) { status = "invalid"; warnings.push("Recording too short or interrupted."); }
  if (rate < C.minRateHz) { status = "invalid"; warnings.push(`Sampling rate too low (< ${C.minRateHz} Hz).`); }
  if (missing / samples.length > C.maxMissingFrac) { if (status === "valid") status = "limited"; warnings.push("More than 10% of samples were missing or invalid."); }
  if (jitter > C.maxIntervalJitter) { if (status === "valid") status = "limited"; warnings.push("Irregular sample timing."); }
  if (!linear) warnings.push("Linear acceleration not exposed; gravity-included signal used with mean removed.");

  let dom: number | null = null, share: number | null = null;
  if (status !== "invalid" && rate >= C.spectralMinRateHz && duration >= C.spectralMinDurationS) {
    const varIdx = [0, 1, 2].reduce((b, k) => (sd(axes[k]) > sd(axes[b]) ? k : b), 0);
    const sp = spectrum(t.map((x) => x - t[0]), axes[varIdx], C.spectrumMinHz, Math.min(C.spectrumMaxHz, rate * 0.4));
    const total = sp.reduce((s, x) => s + x.p, 0);
    const best = sp.reduce((a, b) => (b.p > a.p ? b : a));
    dom = best.f;
    share = total > 0 ? (100 * sp.filter((x) => x.f >= C.bandLowHz && x.f <= C.bandHighHz).reduce((s, x) => s + x.p, 0)) / total : null;
  } else if (status !== "invalid") {
    if (status === "valid") status = "limited";
    warnings.push("Sampling support insufficient for exploratory 4–6 Hz analysis.");
  }

  return {
    ...base,
    status,
    warnings,
    series: downsample(mag, 80),
    metrics: [
      { label: "Sampling rate", value: rate, unit: "Hz", digits: 0 },
      { label: "Duration", value: duration, unit: "s", digits: 1 },
      { label: "Samples", value: validCount, unit: "", digits: 0 },
      { label: "RMS amplitude", value: rms, unit: "m/s²", digits: 3 },
      { label: "Peak amplitude", value: peak, unit: "m/s²", digits: 3 },
      { label: "Dominant frequency", value: dom, unit: "Hz", digits: 1 },
      { label: "4–6 Hz power share", value: share, unit: "%", digits: 0 },
    ],
  };
}
