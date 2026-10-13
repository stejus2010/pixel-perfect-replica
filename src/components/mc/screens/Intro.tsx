import { DEMO_PROFILES, type DemoProfileId } from "@/mc/demoProfiles";
import { Activity, ArrowRight, Clock, FileText, Hand, Mic, MousePointerClick, ShieldCheck, Spline } from "lucide-react";
import figure from "@/assets/motion-figure.jpg";
import { useSession } from "@/mc/session";
import { Btn, Card, Logo, Notice, Page, Stepper, TopBar } from "../ui";

export function WelcomeScreen() {
  const s = useSession();
  return (
    <Page>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4">
        <Logo />
        <nav className="flex gap-1">
          <Btn variant="ghost" onClick={() => s.go("about")}>About</Btn>
          <Btn variant="ghost" onClick={() => s.go("privacy")}>Privacy</Btn>
        </nav>
      </header>
      <section className="relative grid items-center gap-8 overflow-hidden rounded-3xl md:grid-cols-[1.1fr_0.9fr]">
        <div className="relative z-10 py-6">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Movement insights for <span className="text-gradient">a healthier you.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            A short, guided assessment that measures movement and voice features using this tablet's sensors. Not a medical diagnosis.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [Activity, "4 guided tests"],
              [Clock, "About 2 minutes"],
              [ShieldCheck, "Processed on this device"],
              [FileText, "Report for your clinician"],
            ].map(([I, t]) => {
              const Icon = I as typeof Activity;
              return (
                <li key={t as string} className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                  <Icon className="h-6 w-6 text-cyan" />
                  {t as string}
                </li>
              );
            })}
          </ul>
          <Btn className="mt-8 w-full sm:w-auto sm:px-10" onClick={s.start}>
            Start Assessment <ArrowRight className="h-5 w-5" />
          </Btn>
          <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-muted-foreground">
            <input type="checkbox" className="h-5 w-5 accent-[var(--warning)]" checked={s.session.demo} onChange={(e) => s.setDemo(e.target.checked)} />
            Developer demo mode (synthetic data, for presentations only)
          </label>
          <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-warning">Competition demo · simulated data</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(Object.keys(DEMO_PROFILES) as DemoProfileId[]).map((id) => (
                <Btn key={id} variant="secondary" className="h-auto flex-col items-start py-3 text-left" onClick={() => s.loadDemoProfile(id)}>
                  <span>{DEMO_PROFILES[id].label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{DEMO_PROFILES[id].description}</span>
                </Btn>
              ))}
            </div>
          </div>
        </div>
        <img src={figure} alt="" width={1024} height={1024} className="mx-auto w-full max-w-md rounded-3xl opacity-90 [mask-image:radial-gradient(circle,black_55%,transparent_75%)]" />
      </section>
      <Notice className="mt-6">
        This experimental prototype does not diagnose or rule out medical conditions. Results cannot replace professional medical assessment.
      </Notice>
    </Page>
  );
}

export function InfoScreen({ kind }: { kind: "about" | "privacy" }) {
  const s = useSession();
  return (
    <Page className="max-w-3xl">
      <TopBar onBack={() => s.go("welcome")} exit={false} />
      <Card className="p-8">
        {kind === "about" ? (
          <>
            <h1 className="text-3xl font-bold">About Tremor</h1>
            <div className="mt-4 space-y-3 text-muted-foreground">
              <p>Tremor is an experimental, portable movement-assessment prototype. It guides you through four short tasks — hand hold, voice, spiral tracing and alternating taps — and records the features your browser can measure.</p>
              <p>It is not a diagnostic device. It does not detect, diagnose, rule out or predict Parkinson's disease or any other condition. Clinical validity has not been established.</p>
              <p>The report is designed to support a conversation with a healthcare professional.</p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">Privacy</h1>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>All analysis runs in this browser. Sensor, audio, drawing and tap data are not uploaded.</li>
              <li>Raw audio is never stored — only summary values per audio frame are kept in memory.</li>
              <li>Nothing is saved to local storage. Data is cleared when you exit or start a new assessment.</li>
              <li>Microphone and motion permissions are only requested when you start the relevant test.</li>
              <li>The PDF report contains an anonymous session ID and no personal identifiers.</li>
              <li>No accounts, analytics or advertising trackers.</li>
            </ul>
          </>
        )}
      </Card>
    </Page>
  );
}

export function InstructionsScreen() {
  const s = useSession();
  const tasks = [
    [Hand, "Hand Hold", "Two 15-second phases with the tablet in a standard, supported position."],
    [Mic, "Voice", "Say “ahhh” at a comfortable volume for about five seconds."],
    [Spline, "Spiral", "Trace the displayed spiral with a finger or stylus."],
    [MousePointerClick, "Tap Challenge", "Alternate between two targets for 15 seconds."],
  ] as const;
  return (
    <Page>
      <TopBar onBack={() => s.go("setup")} />
      <Stepper current={0} />
      <h1 className="text-3xl font-bold">Before we begin</h1>
      <p className="mt-2 text-muted-foreground">You'll complete 4 short tests. The whole assessment takes about 2 minutes.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {tasks.map(([Icon, t, d]) => (
          <Card key={t} className="flex gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue/15 text-cyan"><Icon className="h-6 w-6" /></div>
            <div className="min-w-0"><h2 className="font-semibold">{t}</h2><p className="text-sm text-muted-foreground">{d}</p></div>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>• Sit comfortably at a table, feet on the floor.</li>
          <li>• Follow the device-position instructions for each test.</li>
          <li>• Find a quiet place for the voice test.</li>
          <li>• Stop at any time if a task causes discomfort.</li>
          <li className="sm:col-span-2">• Results are experimental and are not a diagnosis.</li>
        </ul>
      </Card>
      <Notice className="mt-4">Data is processed locally on this device and is not automatically uploaded. Permissions are requested only when a test starts.</Notice>
      <div className="mt-6 flex justify-end gap-3">
        <Btn variant="secondary" onClick={() => s.go("setup")}>Edit setup</Btn>
        <Btn onClick={() => s.go("rest")}>Continue <ArrowRight className="h-5 w-5" /></Btn>
      </div>
    </Page>
  );
}
