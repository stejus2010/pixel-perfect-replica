import type * as React from "react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, Info, AlertTriangle, XCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/mc/session";
import { QUALITY_LABEL, type Metric, type Quality, fmtValue } from "@/mc/types";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="mcg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--cyan)" />
            <stop offset="1" stopColor="var(--violet)" />
          </linearGradient>
        </defs>
        <path d="M3 18c3 0 4-8 7-8s3 12 6 12 3-16 6-16 4 12 7 12" fill="none" stroke="url(#mcg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-bold tracking-tight">Tremor</span>
    </div>
  );
}

type BtnProps = React.ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" };
export function Btn({ variant = "primary", className, type = "button", ...p }: BtnProps) {
  const v = { primary: "btn-primary", secondary: "btn-secondary", ghost: "btn-ghost", danger: "btn-danger" }[variant];
  return <button type={type} {...p} className={cn(v, className)} />;
}

export function TopBar({ onBack, right, exit = true }: { onBack?: () => void; right?: ReactNode; exit?: boolean }) {
  const { setExitOpen } = useSession();
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <Btn variant="ghost" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" /> <span className="hidden sm:inline">Back</span>
          </Btn>
        )}
        <Logo />
      </div>
      <div className="flex items-center gap-2">
        {right}
        {exit && (
          <Btn variant="ghost" onClick={() => setExitOpen(true)} aria-label="Exit assessment">
            <LogOut className="h-4 w-4" /> Exit
          </Btn>
        )}
      </div>
    </header>
  );
}

const STEPS = ["Instructions", "Hand Hold", "Voice", "Spiral", "Tap", "Results"];
export function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Assessment progress" className="mb-6">
      <ol className="grid grid-cols-6 gap-1">
        {STEPS.map((s, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={s} className="flex flex-col items-center gap-1.5" aria-current={state === "active" ? "step" : undefined}>
              <div className="flex w-full items-center">
                <div className={cn("h-px flex-1", i === 0 ? "opacity-0" : i <= current ? "bg-cyan" : "bg-border")} />
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-num",
                    state === "active" && "border-cyan bg-cyan text-primary-foreground glow-cyan",
                    state === "done" && "border-cyan text-cyan",
                    state === "todo" && "border-border text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <div className={cn("h-px flex-1", i === STEPS.length - 1 ? "opacity-0" : i < current ? "bg-cyan" : "bg-border")} />
              </div>
              <span className={cn("hidden text-[11px] sm:block", state === "active" ? "font-semibold text-cyan" : "text-muted-foreground")}>{s}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glass p-5", className)}>{children}</div>;
}

export function Ring({ remaining, total, label = "seconds", size = 120 }: { remaining: number; total: number; label?: string; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / total));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(remaining)} ${label} remaining`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--raised)" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--cyan)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ filter: "drop-shadow(0 0 6px var(--cyan))", transition: "stroke-dashoffset 0.1s linear" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-num text-3xl font-bold">{Math.ceil(remaining)}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

const QCOL: Record<Quality, string> = {
  valid: "bg-success",
  limited: "bg-warning",
  invalid: "bg-destructive",
  not_completed: "bg-muted-foreground",
};
export function QualityBadge({ status, label }: { status: Quality | null; label?: string | undefined }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span className={cn("h-2.5 w-2.5 rounded-full", status ? QCOL[status] : "bg-muted-foreground")} />
      {label ?? (status ? QUALITY_LABEL[status] : "Waiting")}
    </span>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="glass-raised min-w-0 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-num text-lg font-semibold">{children}</div>
    </div>
  );
}

export function MetricRow({ m }: { m: Metric }) {
  const v = fmtValue(m);
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{m.label}</span>
      <span className={cn("font-num", v === "Not available" ? "text-muted-foreground" : "text-foreground")}>
        {v}
        {v !== "Not available" && m.unit ? <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span> : null}
      </span>
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "error"; children: ReactNode; className?: string }) {
  const Icon = tone === "info" ? Info : tone === "warning" ? AlertTriangle : XCircle;
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("flex gap-3 rounded-xl border p-4 text-sm", tone === "info" && "border-blue/40 bg-blue/10", tone === "warning" && "border-warning/40 bg-warning/10", tone === "error" && "border-destructive/50 bg-destructive/10", className)}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone === "info" ? "text-cyan" : tone === "warning" ? "text-warning" : "text-destructive")} />
      <div className="min-w-0 text-foreground/90">{children}</div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--cyan)", height = 48 }: { values?: number[]; color?: string; height?: number }) {
  const v = (values ?? []).filter(Number.isFinite);
  if (v.length < 2) return <div className="grid place-items-center text-xs text-muted-foreground" style={{ height }}>No data</div>;
  const min = Math.min(...v), max = Math.max(...v), rg = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${height - 4 - ((x - min) / rg) * (height - 8)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Dialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className="glass w-full max-w-md p-6 animate-screen">
        <h2 id="dlg-title" className="text-xl font-bold">{title}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{body}</div>
        <div className="mt-6 flex justify-end gap-3">
          <Btn variant="secondary" ref={ref} onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

export function DemoBanner() {
  const { session } = useSession();
  if (!session.demo) return null;
  return (
    <div className="sticky top-0 z-40 bg-warning py-1.5 text-center text-xs font-bold tracking-wide text-primary-foreground">
      DEVELOPER DEMO MODE — SYNTHETIC DATA, NOT REAL MEASUREMENTS
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-6xl px-4 pb-12 sm:px-8 animate-screen", className)}>{children}</main>;
}
