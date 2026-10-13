/**
 * Tremor experimental configuration.
 *
 * Every number below is an engineering choice for this prototype. NONE of these values
 * is a clinically validated threshold. Scoring is DISABLED by default: with
 * `scoring.enabled = false` the app only shows a neutral summary of measured features.
 * Only enable scoring for internal experiments, and never present its output as a
 * diagnosis or a probability of disease.
 */
export const CONFIG = {
  motion: {
    durationS: 15,
    /** Below this estimated rate the recording is treated as invalid. */
    minRateHz: 15,
    /** 4–6 Hz spectral features need comfortably more than 2 × 6 Hz. */
    spectralMinRateHz: 25,
    spectralMinDurationS: 8,
    maxMissingFrac: 0.1,
    maxIntervalJitter: 0.5,
    noDataTimeoutMs: 2500,
    bandLowHz: 4,
    bandHighHz: 6,
    spectrumMinHz: 1,
    spectrumMaxHz: 12,
  },
  voice: {
    durationS: 5,
    minDurationS: 4,
    minVoicedFrac: 0.2,
    goodVoicedFrac: 0.6,
    minSnrDb: 10,
    minF0: 70,
    maxF0: 500,
    /** Normalised autocorrelation needed to accept a pitch estimate. */
    clarity: 0.6,
    silenceRms: 0.01,
    maxClipFrac: 0.05,
  },
  spiral: {
    turns: 3,
    rMaxFrac: 0.42,
    /** Distance (fraction of canvas) for a reference point to count as covered. */
    coverageTol: 0.05,
    minCoverageValid: 0.8,
    minCoverageAny: 0.5,
    minPoints: 50,
  },
  tap: {
    durationS: 15,
    /** Contacts on the same target within this window are treated as accidental double taps. */
    doubleTapMs: 80,
    minValidTaps: 10,
    maxErrorFrac: 0.25,
  },
  scoring: {
    enabled: false,
    /** UNVALIDATED placeholder flags used only when scoring is enabled. */
    thresholds: {
      motionBandSharePct: 40,
      voiceF0CvPct: 5,
      spiralDeviationPct: 8,
      tapItiCvPct: 20,
    },
  },
} as const;
