export type TestId = "rest" | "arm" | "voice" | "spiral" | "tap";
export type Quality = "valid" | "limited" | "invalid" | "not_completed";

export interface Metric {
  label: string;
  value: number | null;
  unit: string;
  digits?: number;
}

export interface TestResult {
  id: TestId;
  name: string;
  status: Quality;
  warnings: string[];
  metrics: Metric[];
  series?: number[];
  explanation: string;
}

export const QUALITY_LABEL: Record<Quality, string> = {
  valid: "Valid",
  limited: "Limited quality",
  invalid: "Invalid — retest",
  not_completed: "Not completed",
};

export const TEST_NAMES: Record<TestId, string> = {
  rest: "Hand Hold — Resting",
  arm: "Hand Hold — Arm Out",
  voice: "Voice",
  spiral: "Spiral",
  tap: "Tap Challenge",
};

const ORDER: Quality[] = ["valid", "limited", "invalid", "not_completed"];
export const worst = (...q: Quality[]) => q.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), "valid" as Quality);

export function fmtValue(m: Metric): string {
  if (m.value == null || !Number.isFinite(m.value)) return "Not available";
  return m.value.toFixed(m.digits ?? 1);
}

export const getMetric = (r: TestResult | undefined, label: string) =>
  r?.metrics.find((m) => m.label === label)?.value ?? null;

export const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
export const sd = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
export const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
export const percentile = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
export const downsample = (a: number[], n = 60) => {
  if (a.length <= n) return a;
  const step = a.length / n;
  return Array.from({ length: n }, (_, i) => a[Math.floor(i * step)]);
};
