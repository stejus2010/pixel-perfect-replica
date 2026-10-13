import { CONFIG } from "./config";
import { downsample, mean, sd, type TestResult } from "./types";

/** Coordinates are normalised to the square canvas (0–1); t is ms on the performance timeline. */
export interface SpiralPoint { x: number; y: number; t: number; stroke: number }

export function refSpiral(n = 600) {
  const { turns, rMaxFrac } = CONFIG.spiral;
  const th = turns * 2 * Math.PI;
  return Array.from({ length: n }, (_, i) => {
    const a = (th * i) / (n - 1);
    const r = (rMaxFrac * a) / th;
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });
}
const REF = refSpiral(600);
const REF_COARSE = refSpiral(150);

const nearest = (x: number, y: number, ref: { x: number; y: number }[]) => {
  let m = Infinity;
  for (const p of ref) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < m) m = d; }
  return Math.sqrt(m);
};

export function coverage(points: SpiralPoint[]) {
  if (!points.length) return 0;
  const tol = CONFIG.spiral.coverageTol;
  const step = Math.max(1, Math.floor(points.length / 800));
  const sample = points.filter((_, i) => i % step === 0);
  return REF_COARSE.filter((r) => sample.some((p) => (p.x - r.x) ** 2 + (p.y - r.y) ** 2 < tol * tol)).length / REF_COARSE.length;
}

export function analyzeSpiral(points: SpiralPoint[]): TestResult {
  const C = CONFIG.spiral;
  const base = {
    id: "spiral" as const,
    name: "Spiral",
    explanation: "Your traced path compared with the reference spiral. Distances are relative to the spiral’s outer radius, so they do not depend on screen size.",
  };
  if (!points.length) return { ...base, status: "not_completed", warnings: ["No drawing recorded."], metrics: [] };
  const warnings: string[] = [];
  const cov = coverage(points);
  const devs = points.map((p) => nearest(p.x, p.y, REF) / C.rMaxFrac);
  let len = 0;
  const speeds: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.stroke !== b.stroke) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    len += d;
    const dt = (b.t - a.t) / 1000;
    if (dt > 0.002) speeds.push(d / C.rMaxFrac / dt);
  }
  const duration = (points[points.length - 1].t - points[0].t) / 1000;
  const strokes = new Set(points.map((p) => p.stroke)).size;

  // direction roughness: mean absolute heading change over arc-length resampled path
  const step = 0.006;
  const rs: { x: number; y: number }[] = [points[0]];
  for (const p of points) { const l = rs[rs.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) >= step) rs.push(p); }
  const turnsDeg: number[] = [];
  for (let i = 2; i < rs.length; i++) {
    const h1 = Math.atan2(rs[i - 1].y - rs[i - 2].y, rs[i - 1].x - rs[i - 2].x);
    const h2 = Math.atan2(rs[i].y - rs[i - 1].y, rs[i].x - rs[i - 1].x);
    let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    turnsDeg.push(Math.abs(d) * 57.2958);
  }
  // speed fluctuation: mean |Δspeed| / mean speed
  const ds = speeds.slice(1).map((s, i) => Math.abs(s - speeds[i]));
  const fluct = speeds.length > 5 ? mean(ds) / mean(speeds) : null;

  let status: TestResult["status"] = "valid";
  if (points.length < C.minPoints) { status = "invalid"; warnings.push("Too few points recorded."); }
  if (cov < C.minCoverageAny) { status = "invalid"; warnings.push("Spiral not completed — less than half traced."); }
  else if (cov < C.minCoverageValid) { if (status === "valid") status = "limited"; warnings.push("Spiral only partly traced."); }
  if (strokes > 3) { if (status === "valid") status = "limited"; warnings.push(`Drawing interrupted (${strokes} strokes).`); }

  return {
    ...base,
    status,
    warnings,
    series: downsample(speeds, 60),
    metrics: [
      { label: "Completion (coverage)", value: 100 * cov, unit: "%", digits: 0 },
      { label: "Mean deviation", value: 100 * mean(devs), unit: "% of radius", digits: 1 },
      { label: "Max deviation", value: 100 * Math.max(...devs), unit: "% of radius", digits: 1 },
      { label: "Drawing duration", value: duration, unit: "s", digits: 1 },
      { label: "Path length", value: len / C.rMaxFrac, unit: "radii", digits: 1 },
      { label: "Mean speed", value: speeds.length ? mean(speeds) : null, unit: "radii/s", digits: 2 },
      { label: "Speed variation (CV)", value: speeds.length > 2 ? (100 * sd(speeds)) / mean(speeds) : null, unit: "%", digits: 0 },
      { label: "Direction roughness", value: turnsDeg.length > 5 ? mean(turnsDeg) : null, unit: "°/step", digits: 1 },
      { label: "Speed fluctuation index", value: fluct, unit: "", digits: 2 },
      { label: "Strokes", value: strokes, unit: "", digits: 0 },
    ],
  };
}

/** DEMO ONLY: synthetic traced spiral. */
export function demoSpiral(): SpiralPoint[] {
  const ref = refSpiral(500);
  return ref.map((p, i) => ({
    x: p.x + 0.006 * Math.sin(i / 3) + (Math.random() - 0.5) * 0.004,
    y: p.y + 0.006 * Math.cos(i / 4) + (Math.random() - 0.5) * 0.004,
    t: i * 16 + Math.random() * 3,
    stroke: 1,
  }));
}
