import Dexie, { type Table } from 'dexie';
import type { ExerciseDef, GymMode, GymTemplateId, Prescription } from '../plan/types';
import type { Target } from '../engine/progression';
import type { GymVariant } from '../engine/gymPlan';
import type { RunCategory } from '../engine/planGenerator';

export interface SessionSet {
  weight: number | null;
  reps: number;
  rir?: number;
  done: boolean;
  pr?: boolean;
}

export interface SessionExercise {
  slotId: string;
  exerciseId: string;
  prescription: Prescription;
  mode: GymMode;
  target: Target;
  sets: SessionSet[];
  warmups: SessionSet[];
  notes: string;
  optional: boolean;
  skipped?: boolean;
}

export interface GymSessionRec {
  id: string;
  date: string;
  weekIndex: number;
  plannedKey: string | null;
  template: GymTemplateId;
  title: string;
  deload: boolean;
  variant: GymVariant;
  status: 'active' | 'done';
  startedAt: number;
  finishedAt?: number;
  notes: string;
  exercises: SessionExercise[];
}

export interface RunRec {
  id: string;
  date: string;
  weekIndex: number;
  plannedKey: string | null;
  category: RunCategory;
  distanceKm: number;
  durationSec: number;
  avgHr?: number;
  rpe?: number;
  surface: 'ute' | 'lopband';
  notes: string;
  intervalPaceSec?: number;
  test?: '5k' | '10k' | 'race';
  /** Tid för själva testdistansen (hela passet innehåller uppvärmning). */
  testTimeSec?: number;
  /** Importerat testlopp som väntar på att du fyller i testtiden. */
  needsTestTime?: boolean;
  /** Planerade km i hög fart (för andel lugn löpning). */
  plannedWorkKm?: number;
  plannedKm?: number;
  /** Förberett för import av Garmin Connect CSV. */
  source: 'manuell' | 'garmin' | 'intervals';
  name?: string;
  externalId?: string;
  activityType?: string;
  maxHr?: number;
  elevationGainM?: number;
  cadence?: number;
  createdAt: number;
}

export interface SwimRec {
  id: string;
  date: string;
  weekIndex: number;
  distanceM: number;
  durationSec: number;
  avgHr?: number;
  maxHr?: number;
  rpe?: number;
  pool: 'bassang' | 'oppet';
  notes: string;
  source: 'manuell' | 'garmin' | 'intervals';
  name?: string;
  externalId?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Mat
// ---------------------------------------------------------------------------

export type Meal = 'frukost' | 'lunch' | 'middag' | 'mellanmal';

/** Näringsvärden. För livsmedel: per 100 g. För en loggrad: totalt. */
export interface Nutrients {
  kcal: number;
  p?: number;
  c?: number;
  f?: number;
}

/** Hur mycket som åts: gram, eller portioner (då med portionens vikt om den är känd). */
export interface Amount {
  unit: 'g' | 'portion';
  value: number;
}

/**
 * Ett livsmedel som använts eller sparats: egen produkt, cachad Open Food Facts-produkt
 * eller ett livsmedel från Livsmedelsverket som du har ätit (för "Senast ätna" och favoriter).
 */
export interface FoodRec {
  id: string; // "lv:123", "off:<streckkod>", "egen:<uid>"
  source: 'lv' | 'off' | 'egen';
  name: string;
  brand?: string;
  barcode?: string;
  per100: Nutrients;
  /** Gram per portion, om känd. */
  servingG?: number;
  servingLabel?: string;
  favorite?: boolean;
  lastAmount?: Amount;
  lastUsedAt?: number;
  /** Sparad som egen produkt (inte bara cache). */
  saved?: boolean;
  updatedAt: number;
}

export interface RecipeIngredient {
  foodId?: string;
  name: string;
  grams: number;
  per100: Nutrients;
}

export interface RecipeRec {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  /** Antal portioner rätten räcker till. */
  portions: number;
  /** Färdig vikt i gram (valfritt) – gör att du kan logga i gram. */
  totalWeightG?: number;
  favorite?: boolean;
  lastAmount?: Amount;
  lastUsedAt?: number;
  updatedAt: number;
}

export interface FoodLogRec {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  /** Totalt för det som loggades. */
  n: Nutrients;
  amount?: Amount;
  /** Gram per portion när amount är portioner. */
  servingG?: number;
  ref: { kind: 'food' | 'recipe' | 'quick' | 'ai'; id?: string };
  createdAt: number;
}

/** Dagens förbrukning från Garmin (valfri). */
export interface FoodDayRec {
  date: string;
  burnedKcal: number;
}

export interface WeighIn {
  date: string;
  kg: number;
}

export interface ProteinDay {
  date: string;
  done: boolean;
}

export interface ThresholdRec {
  id?: number;
  date: string;
  thresholdSec: number;
  source: 'start' | '5k' | '10k' | 'manuell';
  testTimeSec?: number;
}

export interface KV {
  key: string;
  value: unknown;
}

export class AppDB extends Dexie {
  gymSessions!: Table<GymSessionRec, string>;
  runs!: Table<RunRec, string>;
  swims!: Table<SwimRec, string>;
  foodLog!: Table<FoodLogRec, string>;
  foods!: Table<FoodRec, string>;
  recipes!: Table<RecipeRec, string>;
  foodDays!: Table<FoodDayRec, string>;
  weighIns!: Table<WeighIn, string>;
  protein!: Table<ProteinDay, string>;
  customExercises!: Table<ExerciseDef, string>;
  thresholds!: Table<ThresholdRec, number>;
  kv!: Table<KV, string>;

  constructor(name = 'traningsapp') {
    super(name);
    this.version(1).stores({
      gymSessions: 'id, date, status, weekIndex',
      runs: 'id, date, weekIndex, externalId',
      weighIns: 'date',
      protein: 'date',
      customExercises: 'id',
      thresholds: '++id, date',
      kv: 'key',
    });
    // v2: simpass
    this.version(2).stores({ swims: 'id, date, weekIndex, externalId' });
    // v3: kaloriräknare
    this.version(3).stores({
      foodLog: 'id, date, createdAt',
      foods: 'id, barcode, lastUsedAt',
      recipes: 'id, lastUsedAt',
      foodDays: 'date',
    });
  }
}

export const db = new AppDB();

export const TABLES = ['gymSessions', 'runs', 'swims', 'foodLog', 'foods', 'recipes', 'foodDays', 'weighIns', 'protein', 'customExercises', 'thresholds', 'kv'] as const;

export function uid(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
