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
  }
}

export const db = new AppDB();

export const TABLES = ['gymSessions', 'runs', 'swims', 'weighIns', 'protein', 'customExercises', 'thresholds', 'kv'] as const;

export function uid(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
