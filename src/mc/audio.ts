import { CONFIG } from "./config";
import { downsample, mean, median, percentile, sd, type TestResult } from "./types";

export interface VoiceFrame { t: number; rms: number; peak: number; f0: number | null }
export type MicError = "denied" | "no_device" | "unsupported" | "error";
export class MicFailure extends Error {
  constructor(public kind: MicError) { super(kind); }
}
export interface AudioSource { sampleRate: number; read(buf: Float32Array): void; stop(): void }

export async function openMic(): Promise<AudioSource> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicFailure("unsupported");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e: any) {
    const n = e?.name;
    throw new MicFailure(n === "NotAllowedError" || n === "SecurityError" ? "denied" : n === "NotFoundError" || n === "OverconstrainedError" ? "no_device" : "error");
  }
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  return {
    sampleRate: ctx.sampleRate,
    read: (b) => an.getFloatTimeDomainData(b as Float32Array<ArrayBuffer>),
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      src.disconnect();
      ctx.close().catch(() => {});
    },
  };
}

/** DEMO ONLY: synthetic vowel-like tone. */
export function demoSource(): AudioSource {
  const sr = 48000;
  let phase = 0;
  const t0 = performance.now();
  return {
    sampleRate: sr,
    read(b) {
      const s = (performance.now() - t0) / 1000;
      const f = 180 + 3 * Math.sin(2 * Math.PI * 4 * s);
      const amp = s < 0.3 ? 0.003 : 0.22;
      for (let i = 0; i < b.length; i++) {
        phase += (2 * Math.PI * f) / sr;
        b[i] = amp * (Math.sin(phase) + 0.35 * Math.sin(2 * phase)) + (Math.random() - 0.5) * 0.006;
      }
    },
    stop() {},
  };
}

export function frameStats(b: Float32Array) {
  let s = 0, p = 0;
  for (let i = 0; i < b.length; i++) { s += b[i] * b[i]; const a = Math.abs(b[i]); if (a > p) p = a; }
  return { rms: Math.sqrt(s / b.length), peak: p };
}

/** Normalised autocorrelation pitch estimate on the first 1024 samples. */
export function detectPitch(b: Float32Array, sr: number): number | null {
  const C = CONFIG.voice;
  const W = Math.min(1024, b.length >> 1);
  const minLag = Math.floor(sr / C.maxF0), maxLag = Math.min(Math.ceil(sr / C.minF0), b.length - W - 1);
  const r = new Float32Array(maxLag + 2);
  let e1 = 0;
  for (let i = 0; i < W; i++) e1 += b[i] * b[i];
  if (Math.sqrt(e1 / W) < C.silenceRms) return null;
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0, e2 = 0;
    for (let i = 0; i < W; i++) { const c = b[i + lag]; s += b[i] * c; e2 += c * c; }
    r[lag] = s / (Math.sqrt(e1 * e2) || 1);
  }
  let gmax = 0;
  for (let l = minLag; l <= maxLag; l++) if (r[l] > gmax) gmax = r[l];
  if (gmax < C.clarity) return null;
  // first local peak close to the global max avoids octave errors
  for (let l = minLag; l <= maxLag; l++) {
    if (r[l] >= 0.9 * gmax && r[l] >= r[l - 1] && r[l] >= r[l + 1]) {
      const a = r[l - 1], bb = r[l], c = r[l + 1];
      const d = a - 2 * bb + c;
      const shift = d !== 0 ? (0.5 * (a - c)) / d : 0;
      return sr / (l + shift);
    }
  }
  return null;
}

export const toDb = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-6));

export function analyzeVoice(frames: VoiceFrame[], durationS: number): TestResult {
  const C = CONFIG.voice;
  const base = {
    id: "voice" as const,
    name: "Voice",
    explanation: "Sustained “ahhh” analysed locally. Volume is relative to the microphone’s full scale (dBFS), not a calibrated sound level.",
  };
  if (!frames.length) return { ...base, status: "not_completed", warnings: ["No audio recorded."], metrics: [] };
  const warnings: string[] = [];
  const voiced = frames.filter((f) => f.f0 != null);
  const f0s = voiced.map((f) => f.f0!) ;
  const voicedFrac = voiced.length / frames.length;
  const noise = percentile(frames.map((f) => f.rms), 0.1);
  const vRms = voiced.map((f) => f.rms);
  const snr = voiced.length ? 20 * Math.log10(median(vRms) / Math.max(noise, 1e-6)) : null;
  const clip = frames.filter((f) => f.peak > 0.98).length / frames.length;
  const meanF0 = voiced.length ? mean(f0s) : null;
  const sdF0 = voiced.length > 2 ? sd(f0s) : null;
  const dbs = vRms.map(toDb);

  let status: TestResult["status"] = "valid";
  if (durationS < C.minDurationS) { status = "invalid"; warnings.push("Recording too short or interrupted."); }
  if (voiced.length < 10 || voicedFrac < C.minVoicedFrac) { status = "invalid"; warnings.push("No sustained voice detected (silence or very quiet)."); }
  if (status === "valid" && voicedFrac < C.goodVoicedFrac) { status = "limited"; warnings.push("Voice detected for only part of the recording."); }
  if (snr != null && snr < C.minSnrDb) { if (status === "valid") status = "limited"; warnings.push("Background noise may be high relative to voice."); }
  if (clip > C.maxClipFrac) { if (status === "valid") status = "limited"; warnings.push("Audio clipping detected — try a softer voice."); }
  const ok = status !== "invalid";

  return {
    ...base,
    status,
    warnings,
    series: downsample(f0s, 60),
    metrics: [
      { label: "Recording duration", value: durationS, unit: "s", digits: 1 },
      { label: "Mean pitch (F0)", value: ok ? meanF0 : null, unit: "Hz", digits: 0 },
      { label: "Pitch variation (SD)", value: ok ? sdF0 : null, unit: "Hz", digits: 1 },
      { label: "Pitch variation (CV)", value: ok && sdF0 != null && meanF0 ? (100 * sdF0) / meanF0 : null, unit: "%", digits: 1 },
      { label: "Mean level", value: ok && dbs.length ? mean(dbs) : null, unit: "dBFS", digits: 0 },
      { label: "Level variation (SD)", value: ok && dbs.length > 2 ? sd(dbs) : null, unit: "dB", digits: 1 },
      { label: "Voiced proportion", value: 100 * voicedFrac, unit: "%", digits: 0 },
      { label: "Estimated SNR", value: snr, unit: "dB", digits: 0 },
    ],
  };
}
