import { useState } from "react";
import { ArrowRight, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ageFromDob, CAFFEINE_DRINK_LABEL, CAFFEINE_NOTE, CAFFEINE_TIMING_LABEL, validateAge,
  type CaffeineAnswer, type CaffeineDrink, type CaffeineTiming,
} from "@/mc/context";
import { useSession } from "@/mc/session";
import { Btn, Card, Notice, Page, Stepper, TopBar } from "../ui";

const field = "w-full rounded-xl border border-input bg-background px-4 py-3 text-lg font-num outline-none focus-visible:ring-2 focus-visible:ring-ring";
const choice = (active: boolean) =>
  cn("rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors", active ? "border-blue bg-blue/15 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted");

export function SetupScreen() {
  const s = useSession();
  const c = s.session.context;
  const [mode, setMode] = useState<"age" | "dob">("age");
  const [ageText, setAgeText] = useState(c ? String(c.age) : "");
  const [dob, setDob] = useState("");
  const [caffeine, setCaffeine] = useState<CaffeineAnswer | null>(c?.caffeine ?? null);
  const [timing, setTiming] = useState<CaffeineTiming | undefined>(c?.caffeineTiming);
  const [drink, setDrink] = useState<CaffeineDrink | undefined>(c?.caffeineDrink);
  const [touched, setTouched] = useState(false);

  const ageCheck = mode === "age" ? validateAge(ageText) : ageFromDob(dob);
  const ready = ageCheck.ok && caffeine != null;

  const submit = () => {
    setTouched(true);
    if (!ageCheck.ok || !caffeine) return;
    s.setContext({
      age: ageCheck.age,
      caffeine,
      ...(caffeine === "yes" ? { caffeineTiming: timing, caffeineDrink: drink } : {}),
    });
    s.go("instructions");
  };

  return (
    <Page className="max-w-2xl">
      <TopBar onBack={() => s.endSession("welcome")} />
      <Stepper current={0} />
      <h1 className="text-3xl font-bold">Assessment Setup</h1>
      <p className="mt-2 text-muted-foreground">Two quick questions. Your answers are shown as context with your results and are kept only on this device.</p>

      <Card className="mt-6">
        <label htmlFor="age" className="text-lg font-semibold">What is your age?</label>
        <div className="mt-3 flex gap-2 text-sm" role="tablist">
          <button type="button" className={choice(mode === "age")} onClick={() => setMode("age")}>Enter age</button>
          <button type="button" className={choice(mode === "dob")} onClick={() => setMode("dob")}>Use date of birth</button>
        </div>
        <div className="mt-3">
          {mode === "age" ? (
            <input id="age" inputMode="numeric" placeholder="Age in years" className={field} value={ageText}
              onChange={(e) => setAgeText(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && !ageCheck.ok} />
          ) : (
            <>
              <input id="age" type="date" className={field} value={dob} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDob(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && !ageCheck.ok} />
              <p className="mt-1 text-xs text-muted-foreground">Only your age is calculated and kept. Your date of birth is not stored.{ageCheck.ok && ` Age: ${ageCheck.age}.`}</p>
            </>
          )}
          {touched && !ageCheck.ok && <p role="alert" className="mt-2 text-sm text-destructive">{ageCheck.error}</p>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Age is used as context for reading your measurements. It does not change your scores and is not used to estimate the chance of any condition.</p>
      </Card>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Coffee className="h-5 w-5 text-cyan" /> Have you consumed caffeine in the past 3 hours?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Recent caffeine">
          {(["yes", "no"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={caffeine === v} className={choice(caffeine === v)} onClick={() => setCaffeine(v)}>
              {v === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{CAFFEINE_NOTE}</p>
        {touched && !caffeine && <p role="alert" className="mt-2 text-sm text-destructive">Please choose Yes or No.</p>}

        {caffeine === "yes" && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-sm font-semibold">Optional details</div>
            <div className="mt-2 text-xs text-muted-foreground">Approximately how long ago?</div>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(CAFFEINE_TIMING_LABEL) as CaffeineTiming[]).map((k) => (
                <button key={k} type="button" aria-pressed={timing === k} className={choice(timing === k)} onClick={() => setTiming(timing === k ? undefined : k)}>{CAFFEINE_TIMING_LABEL[k]}</button>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">Type of drink</div>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(CAFFEINE_DRINK_LABEL) as CaffeineDrink[]).map((k) => (
                <button key={k} type="button" aria-pressed={drink === k} className={choice(drink === k)} onClick={() => setDrink(drink === k ? undefined : k)}>{CAFFEINE_DRINK_LABEL[k]}</button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Notice className="mt-4">No name, email or other personal details are collected. Your anonymous session ID stays the same.</Notice>
      <div className="mt-6 flex justify-end gap-3">
        <Btn variant="secondary" onClick={() => s.endSession("welcome")}>Cancel</Btn>
        <Btn onClick={submit} aria-disabled={!ready}>Continue <ArrowRight className="h-5 w-5" /></Btn>
      </div>
    </Page>
  );
}
