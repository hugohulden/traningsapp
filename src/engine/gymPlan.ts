/** Löser upp gympass: vilka övningar, set, reps och läge en viss vecka. */
import {
  EXERCISES,
  GYM_TEMPLATES,
  MAINTENANCE_A,
  OPTIONAL_LEG_SLOTS,
  WEEK26_A_SETS,
} from '../plan/config';
import type { ExerciseDef, GymMode, GymTemplateId, Prescription } from '../plan/types';
import type { AppSettings } from '../plan/settings';
import type { ExerciseInfo } from './progression';

export type GymVariant = 'normal' | 'fas3' | 'v26' | 'latt' | 'underhall';

export interface GymSpec {
  template: GymTemplateId;
  /** Deload om veckan är deload (eller lätt pass i tävlingsveckan). */
  deload: boolean;
  variant: GymVariant;
}

export interface ResolvedSlot {
  slotId: string;
  /** Planens övning (före eventuellt byte). */
  baseExerciseId: string;
  prescription: Prescription;
  mode: GymMode;
  optional: boolean;
}

let customExercises: ExerciseDef[] = [];
export function setCustomExercises(list: ExerciseDef[]) {
  customExercises = list;
}

export function allExercises(): ExerciseDef[] {
  return [...EXERCISES, ...customExercises];
}

export function getExercise(id: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.id === id) ?? customExercises.find((e) => e.id === id);
}

export function stepKg(ex: ExerciseDef, s: Pick<AppSettings, 'stepOverrides' | 'dumbbellStep' | 'machineStep'>): number {
  if (s.stepOverrides[ex.id] != null) return s.stepOverrides[ex.id];
  switch (ex.step.type) {
    case 'fast':
      return ex.step.kg;
    case 'hantel':
      return s.dumbbellStep;
    case 'maskin':
      return s.machineStep;
    case 'reps':
      return 0;
  }
}

export function exerciseInfo(ex: ExerciseDef, s: AppSettings): ExerciseInfo {
  return { kind: ex.kind, step: stepKg(ex, s), bodyweight: ex.bodyweight };
}

export function resolveSlots(spec: GymSpec, settings: Pick<AppSettings, 'extraSets'>): ResolvedSlot[] {
  const t = GYM_TEMPLATES[spec.template];
  const out: ResolvedSlot[] = [];
  for (const slot of t.slots) {
    const legsOff = spec.template === 'C' && spec.variant !== 'normal' && OPTIONAL_LEG_SLOTS.includes(slot.slotId);
    if (legsOff) continue;
    let pr: Prescription = { sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax, rir: slot.rir };
    let mode: GymMode = spec.deload ? 'deload' : 'normal';
    const maint = spec.template === 'A' && (spec.variant === 'fas3' || spec.variant === 'v26' || spec.variant === 'underhall');
    if (maint) {
      const m = MAINTENANCE_A[slot.slotId];
      if (m) pr = { sets: m.sets, repMin: m.repMin, repMax: m.repMax, rir: m.rir };
      if (spec.variant === 'v26') pr = { ...pr, sets: WEEK26_A_SETS };
      if (!spec.deload) mode = 'underhall';
    } else {
      const extra = settings.extraSets[slot.slotId] ?? 0;
      pr = { ...pr, sets: pr.sets + extra };
    }
    out.push({ slotId: slot.slotId, baseExerciseId: slot.exerciseId, prescription: pr, mode, optional: !!slot.optional });
  }
  return out;
}

export function gymTitle(spec: GymSpec): string {
  const base = GYM_TEMPLATES[spec.template].name;
  if (spec.variant === 'latt') return `${base} – lätt`;
  if (spec.template === 'A' && (spec.variant === 'fas3' || spec.variant === 'underhall')) return `${base} – underhåll`;
  if (spec.template === 'A' && spec.variant === 'v26') return `${base} – sista tunga, 2 set`;
  return base;
}
