/**
 * ALLT TRÄNINGSINNEHÅLL BOR HÄR.
 * Ändra övningar, set, reps, steg, veckoplan och regler i den här filen.
 * Ingen UI-kod ska behöva ändras för att justera planen.
 */
import type {
  ExerciseDef,
  GymTemplate,
  MaintenanceOverride,
  PlanWeekDef,
  ZoneKey,
  GymTemplateId,
} from './types';

// ---------------------------------------------------------------------------
// Övningar
// ---------------------------------------------------------------------------

const ex = (e: Omit<ExerciseDef, 'alternatives'> & { alternatives?: string[] }): ExerciseDef => ({
  alternatives: [],
  ...e,
});

export const EXERCISES: ExerciseDef[] = [
  // Gym A – ben
  ex({ id: 'knaboj', name: 'Knäböj (skivstång)', muscleGroup: 'Framsida lår', kind: 'skivstång', step: { type: 'fast', kg: 5 }, compound: true, alternatives: ['knaboj-smith', 'hacksquat'] }),
  ex({ id: 'knaboj-smith', name: 'Knäböj i smithmaskin', muscleGroup: 'Framsida lår', kind: 'maskin', step: { type: 'fast', kg: 5 }, compound: true }),
  ex({ id: 'hacksquat', name: 'Hack squat', muscleGroup: 'Framsida lår', kind: 'maskin', step: { type: 'fast', kg: 5 }, compound: true }),
  ex({ id: 'rdl', name: 'Rumänsk marklyft', muscleGroup: 'Baksida lår/säte', kind: 'skivstång', step: { type: 'fast', kg: 5 }, compound: true, alternatives: ['rdl-hantel'] }),
  ex({ id: 'rdl-hantel', name: 'Rumänsk marklyft med hantlar', muscleGroup: 'Baksida lår/säte', kind: 'hantlar', step: { type: 'hantel' }, compound: true }),
  ex({ id: 'benpress', name: 'Benpress', muscleGroup: 'Framsida lår', kind: 'maskin', step: { type: 'fast', kg: 10 }, compound: true, alternatives: ['bulgarisk', 'hacksquat'] }),
  ex({ id: 'bulgarisk', name: 'Bulgarisk utfallsböj', muscleGroup: 'Framsida lår', kind: 'hantlar', step: { type: 'hantel' }, compound: true }),
  ex({ id: 'lardcurl', name: 'Lårcurl (maskin)', muscleGroup: 'Baksida lår/säte', kind: 'maskin', step: { type: 'maskin' }, compound: false, alternatives: ['lardcurl-liggande'] }),
  ex({ id: 'lardcurl-liggande', name: 'Liggande lårcurl', muscleGroup: 'Baksida lår/säte', kind: 'maskin', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'vadpress-staende', name: 'Stående vadpress', muscleGroup: 'Vader', kind: 'maskin', step: { type: 'maskin' }, compound: false, alternatives: ['vadpress-benpress', 'vadpress-smith'] }),
  ex({ id: 'vadpress-benpress', name: 'Vadpress i benpress', muscleGroup: 'Vader', kind: 'maskin', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'vadpress-smith', name: 'Vadpress i smithmaskin', muscleGroup: 'Vader', kind: 'maskin', step: { type: 'fast', kg: 5 }, compound: false }),
  ex({ id: 'benlyft', name: 'Hängande benlyft', muscleGroup: 'Mage', kind: 'kroppsvikt', step: { type: 'reps' }, compound: false, bodyweight: true, alternatives: ['knalyft-stol'] }),
  ex({ id: 'knalyft-stol', name: 'Knälyft i romersk stol', muscleGroup: 'Mage', kind: 'kroppsvikt', step: { type: 'reps' }, compound: false, bodyweight: true }),

  // Gym B – press
  ex({ id: 'bank', name: 'Bänkpress', muscleGroup: 'Bröst', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: true, alternatives: ['hantelpress', 'bank-smith'] }),
  ex({ id: 'hantelpress', name: 'Hantelpress (bänk)', muscleGroup: 'Bröst', kind: 'hantlar', step: { type: 'hantel' }, compound: true }),
  ex({ id: 'bank-smith', name: 'Bänkpress i smithmaskin', muscleGroup: 'Bröst', kind: 'maskin', step: { type: 'fast', kg: 2.5 }, compound: true }),
  ex({ id: 'latsdrag', name: 'Latsdrag', muscleGroup: 'Rygg', kind: 'kabel', step: { type: 'maskin' }, compound: true, alternatives: ['chins', 'latsdrag-smalt'] }),
  ex({ id: 'latsdrag-smalt', name: 'Latsdrag smalt grepp', muscleGroup: 'Rygg', kind: 'kabel', step: { type: 'maskin' }, compound: true }),
  ex({ id: 'axelpress-hantel', name: 'Sittande hantelpress (axlar)', muscleGroup: 'Axlar', kind: 'hantlar', step: { type: 'hantel' }, compound: true, alternatives: ['axelpress-maskin', 'militarpress'] }),
  ex({ id: 'axelpress-maskin', name: 'Axelpress i maskin', muscleGroup: 'Axlar', kind: 'maskin', step: { type: 'maskin' }, compound: true }),
  ex({ id: 'militarpress', name: 'Stående militärpress', muscleGroup: 'Axlar', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: true }),
  ex({ id: 'kabelrodd', name: 'Sittande kabelrodd', muscleGroup: 'Rygg', kind: 'kabel', step: { type: 'maskin' }, compound: true, alternatives: ['roddmaskin', 'hantelrodd'] }),
  ex({ id: 'roddmaskin', name: 'Sittande rodd i maskin', muscleGroup: 'Rygg', kind: 'maskin', step: { type: 'maskin' }, compound: true }),
  ex({ id: 'hantelrodd', name: 'Enarms hantelrodd', muscleGroup: 'Rygg', kind: 'hantlar', step: { type: 'hantel' }, compound: true }),
  ex({ id: 'sidolyft', name: 'Sidolyft', muscleGroup: 'Axlar', kind: 'hantlar', step: { type: 'hantel' }, compound: false, alternatives: ['sidolyft-kabel', 'sidolyft-maskin'] }),
  ex({ id: 'sidolyft-kabel', name: 'Sidolyft i kabel', muscleGroup: 'Axlar', kind: 'kabel', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'sidolyft-maskin', name: 'Sidolyft i maskin', muscleGroup: 'Axlar', kind: 'maskin', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'pushdown', name: 'Triceps pushdown', muscleGroup: 'Triceps', kind: 'kabel', step: { type: 'maskin' }, compound: false, alternatives: ['pushdown-rep', 'dipsmaskin'] }),
  ex({ id: 'pushdown-rep', name: 'Triceps pushdown med rep', muscleGroup: 'Triceps', kind: 'kabel', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'dipsmaskin', name: 'Dips i maskin', muscleGroup: 'Triceps', kind: 'maskin', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'hantelcurl', name: 'Hantelcurl', muscleGroup: 'Biceps', kind: 'hantlar', step: { type: 'hantel' }, compound: false, alternatives: ['kabelcurl', 'hammarcurl'] }),
  ex({ id: 'kabelcurl', name: 'Kabelcurl', muscleGroup: 'Biceps', kind: 'kabel', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'hammarcurl', name: 'Hammarcurl', muscleGroup: 'Biceps', kind: 'hantlar', step: { type: 'hantel' }, compound: false }),

  // Gym C – drag
  ex({ id: 'chins', name: 'Chins/pull-ups', muscleGroup: 'Rygg', kind: 'kroppsvikt', step: { type: 'fast', kg: 2.5 }, compound: true, bodyweight: true, alternatives: ['latsdrag', 'chins-assist'] }),
  ex({ id: 'chins-assist', name: 'Assisterade chins (maskin)', muscleGroup: 'Rygg', kind: 'maskin', step: { type: 'maskin' }, compound: true }),
  ex({ id: 'lutande-hantelpress', name: 'Lutande hantelpress', muscleGroup: 'Bröst', kind: 'hantlar', step: { type: 'hantel' }, compound: true, alternatives: ['lutande-bank', 'lutande-smith'] }),
  ex({ id: 'lutande-bank', name: 'Lutande bänkpress (skivstång)', muscleGroup: 'Bröst', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: true }),
  ex({ id: 'lutande-smith', name: 'Lutande press i smithmaskin', muscleGroup: 'Bröst', kind: 'maskin', step: { type: 'fast', kg: 2.5 }, compound: true }),
  ex({ id: 'brostrodd', name: 'Bröststödd rodd', muscleGroup: 'Rygg', kind: 'maskin', step: { type: 'fast', kg: 2.5 }, compound: true, alternatives: ['tbar-rodd', 'brostrodd-hantel'] }),
  ex({ id: 'tbar-rodd', name: 'T-bar-rodd', muscleGroup: 'Rygg', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: true }),
  ex({ id: 'brostrodd-hantel', name: 'Bröststödd hantelrodd', muscleGroup: 'Rygg', kind: 'hantlar', step: { type: 'hantel' }, compound: true }),
  ex({ id: 'maskinflyes', name: 'Maskinflyes', muscleGroup: 'Bröst', kind: 'maskin', step: { type: 'maskin' }, compound: false, alternatives: ['kabelflyes', 'hantelflyes'] }),
  ex({ id: 'kabelflyes', name: 'Kabelflyes', muscleGroup: 'Bröst', kind: 'kabel', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'hantelflyes', name: 'Hantelflyes', muscleGroup: 'Bröst', kind: 'hantlar', step: { type: 'hantel' }, compound: false }),
  ex({ id: 'facepulls', name: 'Face pulls', muscleGroup: 'Axlar', kind: 'kabel', step: { type: 'maskin' }, compound: false, alternatives: ['omvanda-flyes'] }),
  ex({ id: 'omvanda-flyes', name: 'Omvända flyes (maskin)', muscleGroup: 'Axlar', kind: 'maskin', step: { type: 'maskin' }, compound: false }),
  ex({ id: 'ezcurl', name: 'EZ-curl', muscleGroup: 'Biceps', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: false, alternatives: ['skivstangscurl', 'kabelcurl'] }),
  ex({ id: 'skivstangscurl', name: 'Skivstångscurl', muscleGroup: 'Biceps', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: false }),
  ex({ id: 'triceps-overhuvud', name: 'Triceps över huvudet (kabel)', muscleGroup: 'Triceps', kind: 'kabel', step: { type: 'maskin' }, compound: false, alternatives: ['fransk-press', 'triceps-overhuvud-hantel'] }),
  ex({ id: 'fransk-press', name: 'Fransk press (EZ-stång)', muscleGroup: 'Triceps', kind: 'skivstång', step: { type: 'fast', kg: 2.5 }, compound: false }),
  ex({ id: 'triceps-overhuvud-hantel', name: 'Triceps över huvudet (hantel)', muscleGroup: 'Triceps', kind: 'hantlar', step: { type: 'hantel' }, compound: false }),
  ex({ id: 'lardcurl-latt', name: 'Lårcurl (lätt)', muscleGroup: 'Baksida lår/säte', kind: 'maskin', step: { type: 'maskin' }, compound: false, alternatives: ['lardcurl-liggande'] }),
  ex({ id: 'vadpress-sittande', name: 'Sittande vadpress', muscleGroup: 'Vader', kind: 'maskin', step: { type: 'maskin' }, compound: false, alternatives: ['vadpress-benpress'] }),
];

// ---------------------------------------------------------------------------
// Gympass
// ---------------------------------------------------------------------------

export const GYM_TEMPLATES: Record<GymTemplateId, GymTemplate> = {
  A: {
    id: 'A',
    name: 'Gym A: Ben',
    slots: [
      { slotId: 'A1', exerciseId: 'knaboj', sets: 3, repMin: 4, repMax: 6, rir: [2, 2] },
      { slotId: 'A2', exerciseId: 'rdl', sets: 3, repMin: 6, repMax: 8, rir: [2, 2] },
      { slotId: 'A3', exerciseId: 'benpress', sets: 3, repMin: 8, repMax: 12, rir: [1, 2] },
      { slotId: 'A4', exerciseId: 'lardcurl', sets: 3, repMin: 8, repMax: 12, rir: [1, 1] },
      { slotId: 'A5', exerciseId: 'vadpress-staende', sets: 3, repMin: 8, repMax: 12, rir: [1, 1] },
      { slotId: 'A6', exerciseId: 'benlyft', sets: 3, repMin: 8, repMax: 15, rir: [1, 1] },
    ],
  },
  B: {
    id: 'B',
    name: 'Gym B: Överkropp (press)',
    slots: [
      { slotId: 'B1', exerciseId: 'bank', sets: 3, repMin: 5, repMax: 8, rir: [1, 2] },
      { slotId: 'B2', exerciseId: 'latsdrag', sets: 3, repMin: 8, repMax: 12, rir: [1, 2] },
      { slotId: 'B3', exerciseId: 'axelpress-hantel', sets: 3, repMin: 8, repMax: 10, rir: [1, 2] },
      { slotId: 'B4', exerciseId: 'kabelrodd', sets: 3, repMin: 8, repMax: 12, rir: [1, 2] },
      { slotId: 'B5', exerciseId: 'sidolyft', sets: 3, repMin: 12, repMax: 20, rir: [0, 1] },
      { slotId: 'B6', exerciseId: 'pushdown', sets: 3, repMin: 10, repMax: 15, rir: [0, 1] },
      { slotId: 'B7', exerciseId: 'hantelcurl', sets: 2, repMin: 10, repMax: 15, rir: [0, 1] },
    ],
  },
  C: {
    id: 'C',
    name: 'Gym C: Överkropp (drag)',
    slots: [
      { slotId: 'C1', exerciseId: 'chins', sets: 3, repMin: 5, repMax: 10, rir: [1, 2] },
      { slotId: 'C2', exerciseId: 'lutande-hantelpress', sets: 3, repMin: 8, repMax: 10, rir: [1, 2] },
      { slotId: 'C3', exerciseId: 'brostrodd', sets: 3, repMin: 8, repMax: 10, rir: [1, 2] },
      { slotId: 'C4', exerciseId: 'maskinflyes', sets: 3, repMin: 10, repMax: 15, rir: [0, 1] },
      { slotId: 'C5', exerciseId: 'facepulls', sets: 3, repMin: 12, repMax: 20, rir: [0, 1] },
      { slotId: 'C6', exerciseId: 'ezcurl', sets: 3, repMin: 8, repMax: 12, rir: [0, 1] },
      { slotId: 'C7', exerciseId: 'triceps-overhuvud', sets: 2, repMin: 10, repMax: 15, rir: [0, 1] },
      { slotId: 'C8', exerciseId: 'lardcurl-latt', sets: 2, repMin: 10, repMax: 12, rir: [2, 2], optional: true },
      { slotId: 'C9', exerciseId: 'vadpress-sittande', sets: 2, repMin: 10, repMax: 12, rir: [2, 2], optional: true },
    ],
  },
};

/** Det valfria benblocket på fredagen (tas bort från fas 3). */
export const OPTIONAL_LEG_SLOTS = ['C8', 'C9'];

/** Gym A i underhållsläge (fas 3). Gäller per plats (slotId). */
export const MAINTENANCE_A: Record<string, MaintenanceOverride> = {
  A1: { exerciseId: 'knaboj', sets: 2, repMin: 3, repMax: 5, rir: [2, 3] },
  A2: { exerciseId: 'rdl', sets: 2, repMin: 6, repMax: 6, rir: [2, 3] },
  A3: { exerciseId: 'benpress', sets: 2, repMin: 8, repMax: 10, rir: [2, 3] },
  // Övriga benövningar: inga set till failure.
  A4: { exerciseId: 'lardcurl', sets: 3, repMin: 8, repMax: 12, rir: [2, 2] },
  A5: { exerciseId: 'vadpress-staende', sets: 3, repMin: 8, repMax: 12, rir: [2, 2] },
  A6: { exerciseId: 'benlyft', sets: 3, repMin: 8, repMax: 15, rir: [1, 2] },
};

/** Vecka 26: sista tunga benpasset, 2 set per övning. */
export const WEEK26_A_SETS = 2;

// ---------------------------------------------------------------------------
// Progressionsregler
// ---------------------------------------------------------------------------

export const PROGRESSION = {
  /** Steg större än så här (andel av vikten) kräver max reps två pass i rad. */
  largeStepFraction: 0.05,
  /** Hantlar kräver alltid två pass i rad. */
  dumbbellsAlwaysTwice: true,
  /** Sänkning vid stagnation (5–10 %). */
  deloadReduction: 0.075,
  /** Extravikt för kroppsviktsövningar. */
  bodyweightAddKg: 2.5,
  /** Deload: antal set färre och RIR-mål. */
  deloadSetReduction: 1,
  deloadRir: [3, 4] as [number, number],
  /** Volymförslag: max set per övning och antal veckors ökning i rad. */
  maxSetsPerExercise: 4,
  volumeWeeksInRow: 3,
  /** Uppvärmning före första basövningen, andel av arbetsvikt. */
  warmupPercents: [0.4, 0.6, 0.8],
  warmupReps: [8, 5, 3],
  /** Vila i sekunder. */
  restCompoundSec: 150,
  restIsolationSec: 75,
};

/** Standardsteg för hantlar och maskiner (kan ändras i inställningarna). */
export const DEFAULT_STEPS = { hantel: 2, maskin: 5 };

/**
 * Startpunkter från dina nuvarande vikter (Nov 2026). Används som första mål
 * när övningen saknar historik. Övriga övningar kalibreras första passet.
 */
export const STARTING_POINTS: Record<string, { weight: number; reps: number[]; note: string }> = {
  knaboj: { weight: 47.5, reps: [4, 4, 4], note: 'Från 42,5 × 8, 8 → ett steg upp till intervallet 4–6' },
  rdl: { weight: 47.5, reps: [6, 6, 6], note: 'Från 42,5 × 8, 8 → ett steg upp till intervallet 6–8' },
  bank: { weight: 55, reps: [5, 5, 5], note: 'Från 52,5 × 8 → ett steg upp till intervallet 5–8' },
  'axelpress-hantel': { weight: 16, reps: [9, 8, 8], note: 'Från 16 × 9 som tredje set' },
  chins: { weight: 0, reps: [8, 8, 7], note: 'Från 8, 8, 6, 6 → +1 rep' },
};

// ---------------------------------------------------------------------------
// Löpning: fartzoner
// ---------------------------------------------------------------------------

/** Sekunder per km. */
export const RUN_DEFAULTS = {
  thresholdSec: 4 * 60 + 35, // T = 4:35/km
  hmGoalSec: 4 * 60 + 30, // 1:35
  hmDreamSec: 4 * 60 + 16, // 1:30
  /** Uppskattad lugn fart för att räkna om tid till km (jogg, uppvärmning). */
  easyEstimateSec: 6 * 60 + 10,
  /** Tempo är inte en egen zon i tabellen: räknas som T + 10 s. */
  tempoOffsetSec: 10,
  /** Puls under detta räknas som lugn puls i statistiken. */
  easyHrMax: 150,
};

export interface ZoneDef {
  key: ZoneKey;
  name: string;
  /** Fart relativt T i sekunder [snabbast, långsammast]; null = fast fart/pulsstyrd */
  offset: [number, number] | null;
  hr: string;
  /** Fart för km-uppskattning relativt T (s). */
  estimateOffset?: number;
}

export const ZONES: ZoneDef[] = [
  { key: 'lugn', name: 'Lugn', offset: null, hr: 'under 150' },
  { key: 'steady', name: 'Steady (marathonfart)', offset: [20, 30], hr: '155–168', estimateOffset: 25 },
  { key: 'tempo', name: 'Tempo', offset: [10, 10], hr: '165–175', estimateOffset: 10 },
  { key: 'troskel', name: 'Tröskel', offset: [0, 0], hr: '170–180', estimateOffset: 0 },
  { key: 'hm', name: 'Halvmarafart', offset: null, hr: '—' },
  { key: 'vo2', name: 'VO2-intervall', offset: [-25, -20], hr: 'upp till ca 190', estimateOffset: -22 },
];

export const EASY_PACE_TEXT = 'pulsstyrd, ca 5:45–6:40/km';

/** Uppdatering av T efter testlopp. */
export const THRESHOLD_FROM_TEST = { '5k': 16, '10k': 7 };
/** Halvmaraprognos. */
export const HM_PREDICT = { '10k': 2.2065, '5k': 4.6 };

// ---------------------------------------------------------------------------
// Löpning: veckoplan (27 veckor)
// ---------------------------------------------------------------------------

export const PLAN_START = '2026-11-16';
export const RACE_DATE = '2027-05-22';
export const RACE_NAME = 'Göteborgsvarvet';
export const RACE_KM = 21.0975;

export const PHASE_NAMES: Record<number, string> = {
  1: 'Fas 1 Bas',
  2: 'Fas 2 Tröskel',
  3: 'Fas 3 Specifik',
  4: 'Nedtrappning',
  5: 'Tävling',
};

const jogg = (min: number) => ({ rest: { min }, restKind: 'jogg' as const });
const vila = (min: number) => ({ rest: { min }, restKind: 'vila' as const });

export const PLAN_WEEKS: PlanWeekDef[] = [
  { week: 1, start: '2026-11-16', phase: 1, deload: false, km: 30, long: { km: 12, text: '12' }, quality: { text: '5 × 4 min VO2, 2 min jogg', blocks: [{ reps: 5, work: { min: 4 }, zone: 'vo2', ...jogg(2) }] } },
  { week: 2, start: '2026-11-23', phase: 1, deload: false, km: 32, long: { km: 13, text: '13' }, quality: { text: '3 × 8 min tröskel, 2 min jogg', blocks: [{ reps: 3, work: { min: 8 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 3, start: '2026-11-30', phase: 1, deload: false, km: 35, long: { km: 14, text: '14' }, quality: { text: '6 × 4 min VO2', blocks: [{ reps: 6, work: { min: 4 }, zone: 'vo2', ...jogg(2) }] } },
  { week: 4, start: '2026-12-07', phase: 1, deload: true, km: 27, long: { km: 11, text: '11' }, quality: { text: '2 × 8 min tröskel', blocks: [{ reps: 2, work: { min: 8 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 5, start: '2026-12-14', phase: 1, deload: false, km: 35, long: { km: 15, text: '15' }, quality: { text: '3 × 10 min tröskel', blocks: [{ reps: 3, work: { min: 10 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 6, start: '2026-12-21', phase: 1, deload: false, km: 37, long: { km: 16, text: '16' }, quality: { text: '5 × 1000 m VO2, 2 min vila', blocks: [{ reps: 5, work: { km: 1 }, zone: 'vo2', ...vila(2) }] } },
  { week: 7, start: '2026-12-28', phase: 1, deload: false, km: 40, long: { km: 17, text: '17' }, quality: { text: '4 × 8 min tröskel', blocks: [{ reps: 4, work: { min: 8 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 8, start: '2027-01-04', phase: 1, deload: true, km: 30, long: { km: 12, text: '12' }, quality: { text: 'TEST 5 km', test: '5k', blocks: [{ reps: 1, work: { km: 5 }, zone: 'test' }] } },
  { week: 9, start: '2027-01-11', phase: 1, deload: false, km: 40, long: { km: 17, text: '17' }, quality: { text: '2 × 15 min tröskel', blocks: [{ reps: 2, work: { min: 15 }, zone: 'troskel', ...jogg(3) }] } },
  { week: 10, start: '2027-01-18', phase: 1, deload: false, km: 42, long: { km: 18, text: '18' }, quality: { text: '6 × 1000 m VO2', blocks: [{ reps: 6, work: { km: 1 }, zone: 'vo2', ...vila(2) }] } },
  { week: 11, start: '2027-01-25', phase: 2, deload: false, km: 44, long: { km: 18, text: '18' }, quality: { text: '3 × 12 min tröskel', blocks: [{ reps: 3, work: { min: 12 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 12, start: '2027-02-01', phase: 2, deload: true, km: 33, long: { km: 14, text: '14' }, quality: { text: '3 × 8 min tröskel', blocks: [{ reps: 3, work: { min: 8 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 13, start: '2027-02-08', phase: 2, deload: false, km: 44, long: { km: 19, text: '19' }, quality: { text: '2 × 20 min tröskel', blocks: [{ reps: 2, work: { min: 20 }, zone: 'troskel', ...jogg(3) }] } },
  { week: 14, start: '2027-02-15', phase: 2, deload: false, km: 46, long: { km: 20, text: '20' }, quality: { text: '5 × 1000 m VO2', blocks: [{ reps: 5, work: { km: 1 }, zone: 'vo2', ...vila(2) }] } },
  { week: 15, start: '2027-02-22', phase: 2, deload: false, km: 48, long: { km: 20, text: '20, sista 4 km steady', segments: [{ km: 4, zone: 'steady', where: 'sist' }] }, quality: { text: '30 min tempo', blocks: [{ reps: 1, work: { min: 30 }, zone: 'tempo' }] } },
  { week: 16, start: '2027-03-01', phase: 2, deload: true, km: 36, long: { km: 15, text: '15' }, quality: { text: 'TEST 10 km', test: '10k', blocks: [{ reps: 1, work: { km: 10 }, zone: 'test' }] } },
  { week: 17, start: '2027-03-08', phase: 2, deload: false, km: 48, long: { km: 21, text: '21' }, quality: { text: '4 × 10 min tröskel', blocks: [{ reps: 4, work: { min: 10 }, zone: 'troskel', ...jogg(2) }] } },
  { week: 18, start: '2027-03-15', phase: 2, deload: false, km: 50, long: { km: 22, text: '22' }, quality: { text: '35 min tempo', blocks: [{ reps: 1, work: { min: 35 }, zone: 'tempo' }] } },
  { week: 19, start: '2027-03-22', phase: 3, deload: false, km: 50, long: { km: 20, text: '20, varav 2 × 3 km halvmarafart', segments: [{ km: 3, reps: 2, zone: 'hm', where: 'varav' }] }, quality: { text: '3 × 3 km halvmarafart, 3 min jogg', blocks: [{ reps: 3, work: { km: 3 }, zone: 'hm', ...jogg(3) }] } },
  { week: 20, start: '2027-03-29', phase: 3, deload: true, km: 38, long: { km: 16, text: '16' }, quality: { text: '4 × 2 km halvmarafart', blocks: [{ reps: 4, work: { km: 2 }, zone: 'hm', ...jogg(3) }] } },
  { week: 21, start: '2027-04-05', phase: 3, deload: false, km: 50, long: { km: 22, text: '22' }, quality: { text: '2 × 5 km halvmarafart', blocks: [{ reps: 2, work: { km: 5 }, zone: 'hm', ...jogg(3) }] } },
  { week: 22, start: '2027-04-12', phase: 3, deload: false, km: 52, long: { km: 20, text: '20, sista 6 km halvmarafart', segments: [{ km: 6, zone: 'hm', where: 'sist' }] }, quality: { text: '6 × 1000 m VO2', blocks: [{ reps: 6, work: { km: 1 }, zone: 'vo2', ...vila(2) }] } },
  { week: 23, start: '2027-04-19', phase: 3, deload: false, km: 52, long: { km: 22, text: '22' }, quality: { text: '10 km i halvmarafart (eller 10 km-lopp)', blocks: [{ reps: 1, work: { km: 10 }, zone: 'hm' }] } },
  { week: 24, start: '2027-04-26', phase: 3, deload: true, km: 40, long: { km: 16, text: '16' }, quality: { text: '3 × 3 km halvmarafart', blocks: [{ reps: 3, work: { km: 3 }, zone: 'hm', ...jogg(3) }] } },
  { week: 25, start: '2027-05-03', phase: 3, deload: false, km: 48, long: { km: 18, text: '18, sista 5 km halvmarafart', segments: [{ km: 5, zone: 'hm', where: 'sist' }] }, quality: { text: '3 × 4 km halvmarafart', blocks: [{ reps: 3, work: { km: 4 }, zone: 'hm', ...jogg(3) }] } },
  { week: 26, start: '2027-05-10', phase: 4, deload: false, km: 34, long: { km: 13, text: '13' }, quality: { text: '3 × 2 km halvmarafart', blocks: [{ reps: 3, work: { km: 2 }, zone: 'hm', ...jogg(3) }] } },
  { week: 27, start: '2027-05-17', phase: 5, deload: false, km: null, long: null, quality: null, raceWeek: true },
];

/** Tävlingsveckan (vecka 27). */
export const RACE_WEEK_TEXT = 'Tis: 7 km med 3 × 1 km halvmarafart. Tor: 4 km lugnt + stegringslopp';
export const RACE_WEEK = {
  tuesday: { km: 7, text: '7 km med 3 × 1 km halvmarafart' },
  thursday: { km: 4, text: '4 km lugnt + stegringslopp' },
  race: { text: 'LOPP lör 22 maj' },
};

/** Generatorregler. */
export const GENERATOR = {
  warmupKm: 2,
  cooldownKm: 2,
  easyMaxKm: 12,
  extraMinKm: 4,
  extraMaxKm: 8,
  /** Lördagspasset visas bara när det blir minst extraMinKm över. */
  stridesText: '6 × 20 s stegringslopp',
  /** Vilken ordning veckor stryks när en vecka upprepas (fas 2 först, bakifrån). */
  dropOrder: [18, 17, 15, 14, 13, 11, 12, 16, 23, 22, 21, 10, 9, 7, 6, 5],
  restartFactor: 0.75,
  /** Dagar utan löpning som utlöser omstart. */
  restartAfterDays: 7,
};

/** Dag i veckan (0 = måndag) för varje pass. */
export const DEFAULT_DAYS = {
  gymA: 0,
  easy: 1,
  gymB: 2,
  quality: 3,
  gymC: 4,
  extra: 5,
  long: 6,
};

// ---------------------------------------------------------------------------
// Efter loppet: återhämtning och marathonblock (struktur, redigerbar)
// ---------------------------------------------------------------------------

export const RECOVERY = {
  weeks: 2,
  runs: [
    { day: 1, km: 5, text: 'Lugn jogg' },
    { day: 3, km: 6, text: 'Lugn jogg' },
    { day: 6, km: 8, text: 'Lugn jogg' },
  ],
  gym: [
    { day: 0, template: 'B' as GymTemplateId },
    { day: 4, template: 'C' as GymTemplateId },
  ],
};

/**
 * UTKAST – marathonblocket. Strukturen genereras av samma motor.
 * Siffrorna är ramar (start/topp) som du kan justera innan blocket börjar.
 */
export const MARATHON = {
  minWeeks: 16,
  maxWeeks: 18,
  runsPerWeek: 4,
  startKm: 40,
  peakKm: 70,
  startLongKm: 20,
  peakLongKm: 32,
  deloadEvery: 4,
  deloadFactor: 0.75,
  taperWeeks: [0.75, 0.55],
  gymPerWeek: [
    { day: 0, template: 'A' as GymTemplateId, maintenance: true },
    { day: 2, template: 'B' as GymTemplateId },
    { day: 4, template: 'C' as GymTemplateId },
  ],
  qualityRotation: [
    { text: '3 × 15 min tröskel', blocks: [{ reps: 3, work: { min: 15 }, zone: 'troskel' as ZoneKey, rest: { min: 2 }, restKind: 'jogg' as const }] },
    { text: '14 km steady', blocks: [{ reps: 1, work: { km: 14 }, zone: 'steady' as ZoneKey }] },
    { text: '6 × 1000 m VO2', blocks: [{ reps: 6, work: { km: 1 }, zone: 'vo2' as ZoneKey, rest: { min: 2 }, restKind: 'vila' as const }] },
  ],
};

// ---------------------------------------------------------------------------
// Kroppsvikt och mat
// ---------------------------------------------------------------------------

export const BODY = {
  startDate: '2026-11-12',
  startKg: 73.5,
  /** Målkurvan dras rakt mellan delmålen. */
  milestones: [
    { date: '2026-11-12', kg: 73.5, label: 'Start' },
    { date: '2027-01-24', kg: 76, label: 'Vecka 10' },
    { date: '2027-03-21', kg: 78, label: 'Vecka 18' },
    { date: '2027-05-22', kg: 78.5, label: 'Tävlingsdagen (78–79)' },
    { date: '2027-08-15', kg: 80, label: 'Sommaren 2027' },
  ],
  weeksBelowForSuggestion: 2,
  kcalSuggestion: 'Lägg till ca 200–250 kcal per dag.',
  proteinText: '120–160 g protein per dag (1,6–2,2 g/kg)',
};

export const BACKUP_REMINDER_DAYS = 14;

// ---------------------------------------------------------------------------
// Förklaringar till löppassen (visas under "Så gör du" och "Vad betyder det?")
// ---------------------------------------------------------------------------

/** Hur varje fartzon ska kännas. */
export const ZONE_FEEL: Record<ZoneKey, string> = {
  lugn: 'Så lugnt att du kan prata i hela meningar. Det är pulsen som styr, inte farten – blir pulsen hög i backar eller motvind, sakta ner. Hellre för långsamt än för fort.',
  steady: 'Kontrollerat och jämnt, lite ansträngande. Du kan säga korta meningar. Ungefär den fart du skulle kunna hålla i ett maraton.',
  tempo: 'Komfortabelt hårt – jämn ansträngning, bara korta fraser går att säga. Något lugnare än tröskel.',
  troskel: 'Hårt men kontrollerat. Du ska kunna hålla samma fart hela intervallen och känna att du hade orkat en till. Maxa inte – för fort gör passet sämre, inte bättre.',
  hm: 'Din målfart för Göteborgsvarvet. Ska kännas kontrollerad. Du övar på att hitta och hålla farten jämnt, så kolla klockan ofta i början.',
  vo2: 'Hårt – ungefär den fart du skulle orka i ett 3–5 km-lopp. Andningen blir tung mot slutet av varje intervall. Håll samma fart i alla, den första ska inte vara snabbast.',
};

/** Begrepp som förekommer i passen. */
export const RUN_TERMS = {
  stegringslopp:
    'Korta, snabba ökningar efter det lugna passet. Börja i jogg och öka gradvis under 20 sekunder till ungefär 90–95 % av maxfart – snabbt men avslappnat, inte en spurt. Tänk lätta, snabba steg och rak hållning. Gå eller jogga lugnt ca 1 minut mellan varje, tills du känner dig pigg igen. Gör dem på plan mark. Syftet är löpsteg och snabbhet, inte att bli trött – passet ska fortfarande kännas lätt.',
  uppvarmning: 'Lugn jogg i lugn fart innan det hårda börjar, så att kroppen är varm.',
  nedjogg: 'Lugn jogg efteråt för att varva ner.',
  jogg: 'Vila genom att jogga mycket lugnt mellan intervallerna (inte stå still).',
  vila: 'Vila genom att gå eller stå still mellan intervallerna.',
  test: 'Spring distansen så fort du kan hålla jämnt hela vägen – som ett lopp. Börja inte för hårt; öka hellre sista kilometern. Logga tiden för själva testdistansen, inte hela passet, så räknar appen om dina fartzoner.',
  lopp: 'Börja kontrollerat i målfart första kilometrarna, håll jämnt och öka om du orkar efter 15 km.',
  lang: 'Långpasset bygger uthållighet. Spring jämnt och lugnt, ta med vätska eller energi på pass över ca 90 minuter.',
};
