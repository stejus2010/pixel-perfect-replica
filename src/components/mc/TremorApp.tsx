import { SessionProvider, useSession } from "@/mc/session";
import { DemoBanner, Dialog } from "@/components/mc/ui";
import { InfoScreen, InstructionsScreen, WelcomeScreen } from "@/components/mc/screens/Intro";
import { SetupScreen } from "@/components/mc/screens/Setup";
import { HandHoldScreen } from "@/components/mc/screens/HandHold";
import { VoiceScreen } from "@/components/mc/screens/Voice";
import { SpiralScreen } from "@/components/mc/screens/Spiral";
import { TapScreen } from "@/components/mc/screens/Tap";
import { CompleteScreen, DetailsScreen, ProcessingScreen, ReportScreen, ResultsScreen } from "@/components/mc/screens/Results";

export function TremorApp() {
  return (
    <SessionProvider>
      <App />
    </SessionProvider>
  );
}

function App() {
  const s = useSession();
  const view = (() => {
    switch (s.screen) {
      case "welcome": return <WelcomeScreen />;
      case "about": return <InfoScreen kind="about" />;
      case "privacy": return <InfoScreen kind="privacy" />;
      case "setup": return <SetupScreen />;
      case "instructions": return <InstructionsScreen />;
      case "rest": return <HandHoldScreen key="rest" phase="rest" />;
      case "arm": return <HandHoldScreen key="arm" phase="arm" />;
      case "voice": return <VoiceScreen />;
      case "spiral": return <SpiralScreen />;
      case "tap": return <TapScreen />;
      case "processing": return <ProcessingScreen />;
      case "results": return <ResultsScreen />;
      case "details": return <DetailsScreen />;
      case "report": return <ReportScreen />;
      case "complete": return <CompleteScreen />;
    }
  })();
  return (
    <div className="min-h-screen">
      <DemoBanner />
      {view}
      <Dialog
        open={s.exitOpen}
        danger
        title="Exit assessment?"
        body="All measurements from this session will be cleared from memory. This cannot be undone."
        confirmLabel="Exit and clear"
        onCancel={() => s.setExitOpen(false)}
        onConfirm={() => s.endSession("welcome")}
      />
    </div>
  );
}
