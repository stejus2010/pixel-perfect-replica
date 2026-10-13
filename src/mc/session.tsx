import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AssessmentContext } from "./context";
import type { VoiceFrame } from "./audio";
import type { MotionSample } from "./motion";
import { summarize, type Summary } from "./quality";
import { DEMO_PROFILES, demoResults, type DemoProfileId } from "./demoProfiles";
import { buildReportPdf } from "./report";
import type { SpiralPoint } from "./spiral";
import type { TapEvent } from "./tap";
import type { TestId, TestResult } from "./types";

export type Screen =
  | "welcome" | "about" | "privacy" | "setup" | "instructions" | "rest" | "arm" | "voice"
  | "spiral" | "tap" | "processing" | "results" | "details" | "report" | "complete";

export interface Raw {
  rest: MotionSample[] | null;
  arm: MotionSample[] | null;
  voice: { frames: VoiceFrame[]; durationS: number } | null;
  spiral: SpiralPoint[] | null;
  tap: { events: TapEvent[]; durationS: number } | null;
}
export interface Session {
  id: string;
  startedAt: Date;
  demo: boolean;
  /** Age + caffeine; kept for the whole session, reset only on a new session. */
  context: AssessmentContext | null;
  raw: Raw;
  skipped: Partial<Record<TestId, boolean>>;
  results: TestResult[] | null;
  summary: Summary | null;
  pdf: Blob | null;
  demoProfile?: DemoProfileId | undefined;
}

const emptyRaw = (): Raw => ({ rest: null, arm: null, voice: null, spiral: null, tap: null });
const newId = () => {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return "MC-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
};
const blank = (demo: boolean): Session => ({ id: "", startedAt: new Date(0), demo, context: null, raw: emptyRaw(), skipped: {}, results: null, summary: null, pdf: null });

interface Ctx {
  screen: Screen;
  session: Session;
  go: (s: Screen) => void;
  start: () => void;
  endSession: (to: Screen) => void;
  setDemo: (d: boolean) => void;
  setContext: (c: AssessmentContext) => void;
  setRaw: <K extends keyof Raw>(k: K, v: Raw[K]) => void;
  skip: (k: TestId) => void;
  setAnalysis: (results: TestResult[], summary: Summary, pdf: Blob | null) => void;
  downloadPdf: () => Promise<void>;
  loadDemoProfile: (p: DemoProfileId) => void;
  exitOpen: boolean;
  setExitOpen: (o: boolean) => void;
}
// Keep one context instance across hot reloads so provider and consumers always match.
const g = globalThis as unknown as { __tremorSessionCtx?: React.Context<Ctx | null> };
const SessionCtx = (g.__tremorSessionCtx ??= createContext<Ctx | null>(null));

export function SessionProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [session, setSession] = useState<Session>(() => blank(false));
  const [exitOpen, setExitOpen] = useState(false);

  const go = useCallback((s: Screen) => {
    setScreen(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<Ctx>(() => ({
    screen, session, go, exitOpen, setExitOpen,
    start: () => { setSession((s) => ({ ...blank(s.demo), id: newId(), startedAt: new Date() })); go("setup"); },
    endSession: (to) => { setSession((s) => blank(s.demo)); setExitOpen(false); go(to); },
    setDemo: (demo) => setSession((s) => ({ ...s, demo })),
    // Editing context invalidates any previously generated PDF so it never shows stale values.
    setContext: (context) => setSession((s) => ({ ...s, context, pdf: null })),
    setRaw: (k, v) => setSession((s) => ({ ...s, raw: { ...s.raw, [k]: v }, skipped: { ...s.skipped, [k]: false } })),
    skip: (k) => setSession((s) => ({ ...s, raw: { ...s.raw, [k]: null }, skipped: { ...s.skipped, [k]: true } })),
    setAnalysis: (results, summary, pdf) => setSession((s) => ({ ...s, results, summary, pdf })),
    loadDemoProfile: (p) => {
      const results = demoResults(p);
      setSession({ ...blank(true), id: newId(), startedAt: new Date(), context: DEMO_PROFILES[p].context, results, summary: summarize(results), demoProfile: p });
      go("results");
    },
    downloadPdf: async () => {
      let blob = session.pdf;
      if (!blob && session.results && session.summary) {
        blob = await buildReportPdf({ id: session.id, startedAt: session.startedAt, demo: session.demo, context: session.context, results: session.results, summary: session.summary, demoProfile: session.demoProfile });
        setSession((s) => ({ ...s, pdf: blob }));
      }
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Tremor-${session.id}${session.demo ? "-DEMO" : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
  }), [screen, session, go, exitOpen]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside provider");
  return c;
}
