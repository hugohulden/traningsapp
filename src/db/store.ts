/** Dataåtgärder och hooks som binder ihop databasen med motorerna. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type GymSessionRec, type RunRec, type SessionExercise, type SessionSet } from './db';
import { DEFAULT_SETTINGS, type AppSettings } from '../plan/settings';
import { BODY, EXERCISES, GYM_TEMPLATES, STARTING_POINTS, RUN_DEFAULTS } from '../plan/config';
import type { ExerciseDef, Prescription, GymMode } from '../plan/types';
import { computeTarget, epley, warmupSets, type HistoryEntry } from '../engine/progression';
import { exerciseInfo, getExercise, resolveSlots, gymTitle, setCustomExercises, type GymSpec, type ResolvedSlot } from '../engine/gymPlan';
import { thresholdFromTest } from '../engine/running';
import { today } from '../lib/dates';
import { weekIndexForDate } from '../engine/planGenerator';

// ---------------------------------------------------------------------------
// Inställningar
// ---------------------------------------------------------------------------

export async function loadSettings(): Promise<AppSettings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const cur = await loadSettings();
  await db.kv.put({ key: 'settings', value: { ...cur, ...patch } });
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(loadSettings, []);
}

export async function initApp(): Promise<void> {
  const s = await loadSettings();
  if (!s.firstUseAt) await saveSettings({ firstUseAt: new Date().toISOString() });
  if ((await db.thresholds.count()) === 0) {
    await db.thresholds.add({ date: today(), thresholdSec: RUN_DEFAULTS.thresholdSec, source: 'start' });
  }
  if ((await db.weighIns.count()) === 0) {
    await db.weighIns.put({ date: BODY.startDate, kg: BODY.startKg });
  }
  setCustomExercises(await db.customExercises.toArray());
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignoreras */
  }
}

// ---------------------------------------------------------------------------
// Övningshistorik
// ---------------------------------------------------------------------------

export function doneSets(e: SessionExercise): { weight: number; reps: number; rir?: number }[] {
  return e.sets.filter((s) => s.done && s.weight != null && s.reps > 0).map((s) => ({ weight: s.weight!, reps: s.reps, rir: s.rir }));
}

export async function allHistory(excludeId?: string): Promise<Map<string, HistoryEntry[]>> {
  const sessions = await db.gymSessions.where('status').equals('done').sortBy('date');
  return historyFromSessions(sessions.filter((s) => s.id !== excludeId));
}

export function historyFromSessions(sessions: GymSessionRec[]): Map<string, HistoryEntry[]> {
  const map = new Map<string, HistoryEntry[]>();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
  for (const s of sorted) {
    for (const e of s.exercises) {
      const sets = doneSets(e);
      if (!sets.length) continue;
      const list = map.get(e.exerciseId) ?? [];
      list.push({ date: s.date, mode: e.mode, sets });
      map.set(e.exerciseId, list);
    }
  }
  return map;
}

export async function latestBodyKg(): Promise<number> {
  const last = await db.weighIns.orderBy('date').last();
  return last?.kg ?? BODY.startKg;
}

/** Bästa estimerade 1RM hittills (för personbästa). */
export function bestE1rm(history: HistoryEntry[], ex: ExerciseDef, bodyKg: number): number {
  const extra = ex.bodyweight ? bodyKg : 0;
  let best = 0;
  for (const h of history) for (const s of h.sets) best = Math.max(best, epley(s.weight + extra, s.reps));
  return best;
}

// ---------------------------------------------------------------------------
// Gympass
// ---------------------------------------------------------------------------

export function buildExercise(
  slot: { slotId: string; prescription: Prescription; mode: GymMode; optional: boolean },
  exerciseId: string,
  history: HistoryEntry[],
  settings: AppSettings,
  withWarmup: boolean,
): SessionExercise {
  const ex = getExercise(exerciseId)!;
  const info = exerciseInfo(ex, settings);
  const target = computeTarget({ exercise: info, prescription: slot.prescription, mode: slot.mode, history, start: STARTING_POINTS[exerciseId] });
  const sets: SessionSet[] = target.sets.map((t) => ({ weight: t.weight, reps: t.reps, done: false }));
  const w = target.sets[0]?.weight;
  const warmups: SessionSet[] = withWarmup && w ? warmupSets(w, info).map((s) => ({ ...s, done: false })) : [];
  return { slotId: slot.slotId, exerciseId, prescription: slot.prescription, mode: slot.mode, target, sets, warmups, notes: '', optional: slot.optional };
}

export async function startGymSession(spec: GymSpec, date: string, plannedKey: string | null): Promise<string> {
  const settings = await loadSettings();
  const hist = await allHistory();
  const slots: ResolvedSlot[] = resolveSlots(spec, settings);
  let warmupGiven = false;
  const exercises = slots.map((slot) => {
    const choice = settings.slotChoice[slot.slotId];
    const base = getExercise(slot.baseExerciseId)!;
    const exId = choice && (base.alternatives.includes(choice) || choice === base.id || getExercise(choice)?.custom) ? choice : slot.baseExerciseId;
    const ex = getExercise(exId)!;
    const warm = !warmupGiven && ex.compound && !ex.bodyweight;
    if (warm) warmupGiven = true;
    return buildExercise(slot, exId, hist.get(exId) ?? [], settings, warm);
  });
  const rec: GymSessionRec = {
    id: uid(),
    date,
    weekIndex: weekIndexForDate(date),
    plannedKey,
    template: spec.template,
    title: gymTitle(spec),
    deload: spec.deload,
    variant: spec.variant,
    status: 'active',
    startedAt: Date.now(),
    notes: '',
    exercises,
  };
  await db.gymSessions.put(rec);
  return rec.id;
}

export async function saveGymSession(rec: GymSessionRec): Promise<void> {
  await db.gymSessions.put(rec);
}

export async function switchExercise(rec: GymSessionRec, index: number, exerciseId: string): Promise<GymSessionRec> {
  const settings = await loadSettings();
  const hist = await allHistory(rec.id);
  const cur = rec.exercises[index];
  const ex = getExercise(exerciseId)!;
  const next = buildExercise(cur, exerciseId, hist.get(exerciseId) ?? [], settings, cur.warmups.length > 0 && ex.compound && !ex.bodyweight);
  next.notes = cur.notes;
  const exercises = [...rec.exercises];
  exercises[index] = next;
  const updated = { ...rec, exercises };
  await db.gymSessions.put(updated);
  await saveSettings({ slotChoice: { ...settings.slotChoice, [cur.slotId]: exerciseId } });
  return updated;
}

export async function addExerciseToSession(rec: GymSessionRec, exerciseId: string): Promise<GymSessionRec> {
  const settings = await loadSettings();
  const hist = await allHistory(rec.id);
  const pr: Prescription = { sets: 3, repMin: 8, repMax: 12, rir: [1, 2] };
  const e = buildExercise({ slotId: `extra-${uid().slice(0, 6)}`, prescription: pr, mode: rec.deload ? 'deload' : 'normal', optional: true }, exerciseId, hist.get(exerciseId) ?? [], settings, false);
  const updated = { ...rec, exercises: [...rec.exercises, e] };
  await db.gymSessions.put(updated);
  return updated;
}

export async function finishGymSession(rec: GymSessionRec): Promise<GymSessionRec> {
  const done = { ...rec, status: 'done' as const, finishedAt: Date.now() };
  await db.gymSessions.put(done);
  return done;
}

export async function deleteGymSession(id: string) {
  await db.gymSessions.delete(id);
}

export function useActiveGymSession(): GymSessionRec | undefined | null {
  return useLiveQuery(async () => (await db.gymSessions.where('status').equals('active').first()) ?? null, []);
}

export interface SummaryLine {
  exerciseId: string;
  name: string;
  did: string;
  next: string;
  nextReason: string;
  improved: boolean;
  pr: boolean;
}

/** Sammanfattning efter passet: vad som ökade och nästa mål. */
export async function sessionSummary(rec: GymSessionRec): Promise<SummaryLine[]> {
  const settings = await loadSettings();
  const histAll = await allHistory();
  const histBefore = await allHistory(rec.id);
  const bodyKg = await latestBodyKg();
  const out: SummaryLine[] = [];
  for (const e of rec.exercises) {
    const ex = getExercise(e.exerciseId);
    if (!ex) continue;
    const sets = doneSets(e);
    if (!sets.length) continue;
    const before = histBefore.get(e.exerciseId) ?? [];
    const prev = [...before].reverse().find((h) => h.mode === e.mode || (h.mode !== 'deload' && e.mode !== 'deload'));
    const vol = (xs: { weight: number; reps: number }[]) => xs.reduce((a, s) => a + (s.weight + (ex.bodyweight ? bodyKg : 0)) * s.reps, 0);
    const maxW = (xs: { weight: number }[]) => Math.max(...xs.map((s) => s.weight));
    const tot = (xs: { reps: number }[]) => xs.reduce((a, s) => a + s.reps, 0);
    const improved = !!prev && (maxW(sets) > maxW(prev.sets) || (maxW(sets) === maxW(prev.sets) && tot(sets) > tot(prev.sets)) || vol(sets) > vol(prev.sets) * 1.001);
    const pr = bestE1rm([{ date: rec.date, mode: e.mode, sets }], ex, bodyKg) > bestE1rm(before, ex, bodyKg) + 1e-6 && before.length > 0;
    const t = computeTarget({ exercise: exerciseInfo(ex, settings), prescription: e.prescription, mode: e.mode === 'deload' ? 'normal' : e.mode, history: histAll.get(e.exerciseId) ?? [] });
    out.push({
      exerciseId: e.exerciseId,
      name: ex.name,
      did: sets.map((s) => `${fmtW(s.weight)}×${s.reps}`).join(', '),
      next: t.sets.map((s) => `${s.weight == null ? '?' : fmtW(s.weight)}×${s.reps}`).join(', '),
      nextReason: t.reason,
      improved,
      pr,
    });
  }
  return out;
}

const fmtW = (w: number) => String(w).replace('.', ',');

// ---------------------------------------------------------------------------
// Egna övningar
// ---------------------------------------------------------------------------

export async function addCustomExercise(def: Omit<ExerciseDef, 'id' | 'custom' | 'alternatives'>): Promise<ExerciseDef> {
  const e: ExerciseDef = { ...def, id: `egen-${uid().slice(0, 8)}`, custom: true, alternatives: [] };
  await db.customExercises.put(e);
  setCustomExercises(await db.customExercises.toArray());
  return e;
}

export function useCustomExercises() {
  return useLiveQuery(async () => {
    const list = await db.customExercises.toArray();
    setCustomExercises(list);
    return list;
  }, []);
}

/** Övningar som ingår i någon mall (för statistik). */
export function templateExerciseIds(): string[] {
  return Object.values(GYM_TEMPLATES).flatMap((t) => t.slots.map((s) => s.exerciseId));
}

export function exerciseName(id: string): string {
  return getExercise(id)?.name ?? EXERCISES.find((e) => e.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Löpning
// ---------------------------------------------------------------------------

export async function saveRun(run: Omit<RunRec, 'id' | 'createdAt' | 'weekIndex'> & { id?: string }): Promise<{ newThreshold?: number }> {
  const rec: RunRec = { ...run, id: run.id ?? uid(), createdAt: Date.now(), weekIndex: weekIndexForDate(run.date) };
  await db.runs.put(rec);
  const testSec = rec.testTimeSec ?? (rec.needsTestTime ? 0 : rec.durationSec);
  if ((rec.test === '5k' || rec.test === '10k') && testSec > 0) {
    const T = thresholdFromTest(rec.test, testSec);
    await db.thresholds.where('date').equals(rec.date).filter((t) => t.source === rec.test).delete();
    await db.thresholds.add({ date: rec.date, thresholdSec: T, source: rec.test, testTimeSec: testSec });
    await saveSettings({ thresholdSec: T });
    return { newThreshold: T };
  }
  return {};
}

export async function deleteRun(id: string) {
  await db.runs.delete(id);
}

export async function setThresholdManually(sec: number) {
  await db.thresholds.add({ date: today(), thresholdSec: sec, source: 'manuell' });
  await saveSettings({ thresholdSec: sec });
}
