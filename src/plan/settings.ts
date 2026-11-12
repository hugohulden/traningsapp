import { DEFAULT_STEPS, PROGRESSION, RUN_DEFAULTS } from './config';

export interface MissedWeek {
  /** Kalenderveckans index (0 = vecka 1) som missades. */
  index: number;
  /** Omstart på 75 % efter 7+ dagar utan löpning. */
  restart: boolean;
}

export interface AppSettings {
  thresholdSec: number;
  hmGoalSec: number;
  hmDreamSec: number;
  easyEstimateSec: number;
  tempoOffsetSec: number;
  dumbbellStep: number;
  machineStep: number;
  restCompoundSec: number;
  restIsolationSec: number;
  /** Eget ökningssteg per övning (kg). */
  stepOverrides: Record<string, number>;
  /** Godkända volymförslag: extra set per plats (slotId). */
  extraSets: Record<string, number>;
  /** Avböjda volymförslag (nyckel = slotId:vecka). */
  dismissedSuggestions: string[];
  /** Senast valda övning per plats (alternativ). */
  slotChoice: Record<string, string>;
  /** Flyttade pass: "veckoindex:passnyckel" → dag (0 = mån). */
  dayOverrides: Record<string, number>;
  missedWeeks: MissedWeek[];
  /** Hoppa över omstartsfrågan för denna vecka. */
  restartDismissedWeek: number | null;
  marathonDate: string | null;
  lastBackupAt: string | null;
  firstUseAt: string | null;
  soundOn: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  thresholdSec: RUN_DEFAULTS.thresholdSec,
  hmGoalSec: RUN_DEFAULTS.hmGoalSec,
  hmDreamSec: RUN_DEFAULTS.hmDreamSec,
  easyEstimateSec: RUN_DEFAULTS.easyEstimateSec,
  tempoOffsetSec: RUN_DEFAULTS.tempoOffsetSec,
  dumbbellStep: DEFAULT_STEPS.hantel,
  machineStep: DEFAULT_STEPS.maskin,
  restCompoundSec: PROGRESSION.restCompoundSec,
  restIsolationSec: PROGRESSION.restIsolationSec,
  stepOverrides: {},
  extraSets: {},
  dismissedSuggestions: [],
  slotChoice: {},
  dayOverrides: {},
  missedWeeks: [],
  restartDismissedWeek: null,
  marathonDate: null,
  lastBackupAt: null,
  firstUseAt: null,
  soundOn: true,
};
