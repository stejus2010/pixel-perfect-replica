# Tremor by Kinetiq

Tablet-based Parkinson's **screening prototype** (competition demo). Four tests → per-test scores (0–100) → per-test thresholds → rule-based screening outcome → PDF report. Not a diagnostic device.

## Setup
```bash
bun install        # or npm install
bun run dev        # http://localhost:8080
bun run test       # vitest
bun run lint
bun run build
```
No backend, database or environment variables. All processing runs in the browser.

## Flow
Welcome → Participant setup (age, caffeine in past 3 h) → Hand Hold (rest + arm out) → Voice → Spiral → Tap → Processing → Results → PDF.
Demo: three buttons on the welcome page load deterministic **SIMULATED DEMO DATA** profiles straight to Results. The "Developer demo mode" checkbox instead runs the full test flow with synthetic sensor input.

## Architecture (`src/mc/`)
| File | Role |
|---|---|
| `motion.ts`, `audio.ts`, `spiral.ts`, `tap.ts` | Sensor capture + raw feature extraction |
| `quality.ts`, `config.ts` | Data-quality rules and capture settings |
| `scoring.ts` | Feature → 0–100 score per test (`assessResults`) |
| `thresholds.ts` | **Threshold config + evaluation engine + referral rule** |
| `demoProfiles.ts` | Deterministic demo feature values |
| `context.ts` | Age / caffeine validation |
| `report.ts` | jsPDF report |
| `session.tsx` | In-memory session state |
UI lives in `src/components/mc/screens/`.

## Scores (direction verified)
`score = clamp(100 × feature / referenceMax, 0, 100)` — **higher = more measured deviation/variability** for all four tests.
- Hand Hold: mean of resting/arm-out RMS device acceleration; 0.5 m/s² → 100.
- Voice: mean of pitch CV (10% → 100) and level SD (6 dB → 100).
- Spiral: mean tracing deviation; 20% of radius → 100.
- Tap: inter-tap interval CV; 40% → 100.

## Thresholds (`src/mc/thresholds.ts`)
All **provisional**, comparison "at or above" (score equal to threshold counts as crossed).
| Test | Threshold | Origin |
|---|---|---|
| Hand Hold | 50 | Provisional mid-scale |
| Voice | 50 | Prototype placeholder 5% pitch CV |
| Spiral | 40 | Prototype placeholder 8% deviation |
| Tap | 50 | Prototype placeholder 20% ITI CV |

Referral rule (`REFERRAL_RULE`): ≥3 crossings → "Multiple screening thresholds crossed". Fewer than 3 valid tests without 3 crossings → "Screening incomplete". Otherwise "Fewer screening thresholds crossed". Tests with missing data or failed quality are "Unable to assess" and never counted as normal. `ageBands` exist per test but are empty — no compatible age-specific data.

## Reference datasets — status
Results and PDF include **fictional demo normal scores**: Hand Hold 20/100, Voice 25/100, Spiral 20/100, Tap 25/100. These are made-up illustrative values, calculated from the simulated control profile through the scoring pipeline. They are not validated healthy-population averages, never populate reference datasets, and do not affect thresholds or referral decisions. Comparison content is shared through `interpretation.ts`.

Candidate sources listed in `thresholds.ts` (Zenodo 7273759, UCI 489 voice, UCI 395 spiral, ETF finger-tapping DB) have **not been downloaded or analysed**. Their measurements are not yet mapped to Tremor's features, so no research-derived cutoffs are applied. Next step: extract Tremor-equivalent features from each dataset, derive cutoffs (e.g. control mean + 2 SD, checking distribution and n), and set `status: "research_derived"`.

## Known limitations
- Thresholds and score scaling are engineering choices, not clinically validated.
- No sensitivity/specificity data exist. The outcome is a rule-based classification, not a probability.
- Hand Hold uses device acceleration, which also captures non-tremor movement.
