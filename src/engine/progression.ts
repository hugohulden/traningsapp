/**
 * Progressionsmotorn: dubbel progression per övning.
 * Ren logik utan UI och databas – täckt av progression.test.ts.
 */
import { PROGRESSION } from '../plan/config';
import type { EquipmentKind, GymMode, Prescription } from '../plan/types';

export interface LoggedSet {
  weight: number;
  reps: number;
  rir?: number;
}

export interface HistoryEntry {
  date: string;
  mode: GymMode;
  sets: LoggedSet[];
}

export interface ExerciseInfo {
  kind: EquipmentKind;
  /** Ökningssteg i kg. 0 = bara reps. */
  step: number;
  bodyweight?: boolean;
}

export type TargetKind =
  | 'kalibrering'
  | 'start'
  | 'okning'
  | 'reps'
  | 'upprepa-max'
  | 'max-reps'
  | 'sankning'
  | 'deload'
  | 'underhall';

export interface TargetSet {
  /** null = ska kalibreras (skriv in vikt) */
  weight: number | null;
  reps: number;
}

export interface Target {
  kind: TargetKind;
  sets: TargetSet[];
  rir: [number, number];
  reason: string;
  /** Visa diskret notis om sömn, mat och vikttrend. */
  wellnessNotice?: boolean;
  /** Förslag som inte tillämpas automatiskt. */
  suggestion?: string;
}

export interface ProgressionInput {
  exercise: ExerciseInfo;
  prescription: Prescription;
  mode: GymMode;
  /** Historik för just den här övningen, äldst först. */
  history: HistoryEntry[];
  start?: { weight: number; reps: number[] };
  rules?: Partial<typeof PROGRESSION>;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Arbetsvikt i ett pass = tyngsta vikten. */
export function workWeight(sets: LoggedSet[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight), 0);
}

export function totalReps(sets: LoggedSet[]): number {
  return sets.reduce((a, s) => a + s.reps, 0);
}

/** Epley: vikt × (1 + reps/30) */
export function epley(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

/** Bästa set enligt estimerad 1RM. extraLoad läggs till (kroppsvikt). */
export function bestSet(sets: LoggedSet[], extraLoad = 0): { set: LoggedSet; e1rm: number } | null {
  let best: { set: LoggedSet; e1rm: number } | null = null;
  for (const s of sets) {
    const e = epley(s.weight + extraLoad, s.reps);
    if (!best || e > best.e1rm) best = { set: s, e1rm: e };
  }
  return best;
}

/** Rutnät att avrunda till vid sänkning. */
function grid(ex: ExerciseInfo): number {
  if (ex.kind === 'skivstång') return Math.min(2.5, ex.step || 2.5);
  return ex.step || 2.5;
}

/** Sänk vikten ca 7,5 % och avrunda nedåt till ett rimligt steg, minst ett steg. */
export function reducedWeight(w: number, ex: ExerciseInfo, fraction: number): number {
  const g = grid(ex);
  let nw = Math.floor((w * (1 - fraction)) / g + 1e-9) * g;
  if (nw > w - g) nw = w - g;
  return Math.max(0, Math.round(nw * 100) / 100);
}

/**
 * +1 rep på minst ett set jämfört med förra gången.
 * Set som ligger under första setet höjs med 1 (upp till första setets nivå).
 * Om alla senare set redan når första setet höjs första setet.
 * Exempel: 8, 7, 6 → 8, 8, 7.   8, 8, 8 → 9, 8, 8.
 */
export function plusOneRep(prev: number[], max: number): number[] {
  const p = prev.map((r) => Math.min(r, max));
  const t = [...p];
  const anyLower = p.slice(1).some((r) => r < p[0]);
  if (anyLower) {
    for (let i = 1; i < p.length; i++) if (p[i] < p[0]) t[i] = Math.min(p[i] + 1, p[0]);
  } else {
    // Höj det första set som inte redan är på max.
    const i = p.findIndex((r) => r < max);
    if (i >= 0) t[i] = p[i] + 1;
  }
  return t;
}

/** Normalisera förra passets reps till rätt antal set. */
function normalizeReps(sets: LoggedSet[], count: number, fallback: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (i < sets.length) out.push(sets[i].reps);
    else out.push(out.length ? out[out.length - 1] : fallback);
  }
  return out;
}

function allMax(entry: HistoryEntry, p: Prescription, w: number): boolean {
  if (entry.sets.length < p.sets) return false;
  return entry.sets.slice(0, p.sets).every((s) => s.weight >= w && s.reps >= p.repMax);
}

function sameWeight(a: HistoryEntry, b: HistoryEntry) {
  return Math.abs(workWeight(a.sets) - workWeight(b.sets)) < 1e-6;
}

const uniform = (n: number, weight: number | null, reps: number): TargetSet[] =>
  Array.from({ length: n }, () => ({ weight, reps }));

export function requiresTwice(ex: ExerciseInfo, w: number, rules = PROGRESSION): boolean {
  if (ex.bodyweight) return false;
  if (ex.kind === 'hantlar' && rules.dumbbellsAlwaysTwice) return true;
  if (w <= 0) return false;
  return ex.step / w > rules.largeStepFraction + 1e-9;
}

export function computeTarget(input: ProgressionInput): Target {
  const rules = { ...PROGRESSION, ...input.rules };
  const { exercise: ex, prescription: p, mode } = input;
  const history = input.history.filter((h) => h.sets.length > 0);
  const nonDeload = history.filter((h) => h.mode !== 'deload');
  const ref = nonDeload[nonDeload.length - 1];

  // --- Deload: samma vikt, ett set färre, RIR 3–4 ---------------------------
  if (mode === 'deload') {
    const sets = Math.max(1, p.sets - rules.deloadSetReduction);
    const w = ref ? workWeight(ref.sets) : (input.start?.weight ?? null);
    return {
      kind: 'deload',
      sets: uniform(sets, w, p.repMin),
      rir: rules.deloadRir,
      reason: w == null ? 'Deload – välj en lätt vikt' : `Deload: samma vikt, ${sets} set, RIR ${rules.deloadRir[0]}–${rules.deloadRir[1]}`,
    };
  }

  // --- Underhåll (fas 3): håll vikten, ingen progression --------------------
  if (mode === 'underhall') {
    const w = ref ? workWeight(ref.sets) : (input.start?.weight ?? null);
    const t: Target = {
      kind: 'underhall',
      sets: uniform(p.sets, w, p.repMax),
      rir: p.rir,
      reason: 'Underhåll: håll vikten, inga set till failure',
    };
    const last = history[history.length - 1];
    if (
      w != null &&
      ex.step > 0 &&
      last?.mode === 'underhall' &&
      last.sets.length > 0 &&
      last.sets.every((s) => s.rir != null && s.rir >= p.rir[1] + 2)
    ) {
      t.suggestion = `Förra passet kändes klart lätt (RIR ≥ ${p.rir[1] + 2}). Du kan höja till ${fmt(w + ex.step)} kg.`;
    }
    return t;
  }

  // --- Normal progression ---------------------------------------------------
  const basis = history.filter((h) => h.mode === 'normal');

  if (basis.length === 0) {
    if (ref) {
      const w = workWeight(ref.sets);
      return { kind: 'start', sets: uniform(p.sets, w, p.repMin), rir: p.rir, reason: 'Fortsätter från senaste pass' };
    }
    if (input.start) {
      const reps = normalizeReps(
        input.start.reps.map((r) => ({ weight: input.start!.weight, reps: r })),
        p.sets,
        p.repMin,
      );
      return {
        kind: 'start',
        sets: reps.map((r) => ({ weight: input.start!.weight, reps: r })),
        rir: p.rir,
        reason: 'Startvikt från dina nuvarande vikter',
      };
    }
    if (ex.bodyweight) {
      return {
        kind: 'kalibrering',
        sets: uniform(p.sets, 0, p.repMin),
        rir: [2, 3],
        reason: `Kalibrering: kroppsvikt, sikta på ca 2–3 RIR inom ${p.repMin}–${p.repMax} reps`,
      };
    }
    return {
      kind: 'kalibrering',
      sets: uniform(p.sets, null, p.repMin),
      rir: [2, 3],
      reason: `Kalibrering: skriv in din vikt, eller jobba upp till en vikt som ger ca 2–3 RIR på ${p.repMin}–${p.repMax} reps`,
    };
  }

  const last = basis[basis.length - 1];
  const W = workWeight(last.sets);
  const prev = basis[basis.length - 2];
  const prev2 = basis[basis.length - 3];

  // Regel 7: sänkning vid stagnation.
  const missMin =
    prev && sameWeight(last, prev) && last.sets[0].reps < p.repMin && prev.sets[0].reps < p.repMin;
  const backsliding =
    prev &&
    prev2 &&
    sameWeight(last, prev) &&
    sameWeight(prev, prev2) &&
    totalReps(last.sets) < totalReps(prev.sets) &&
    totalReps(prev.sets) < totalReps(prev2.sets);

  if ((missMin || backsliding) && ex.step > 0 && W > 0) {
    const nw = reducedWeight(W, ex, rules.deloadReduction);
    return {
      kind: 'sankning',
      sets: uniform(p.sets, nw, p.repMin),
      rir: p.rir,
      reason: missMin
        ? `Under ${p.repMin} reps på första setet två pass i rad – sänker till ${fmt(nw)} kg och bygger upp igen`
        : `Backat två pass i rad – sänker till ${fmt(nw)} kg och bygger upp igen`,
      wellnessNotice: true,
    };
  }

  // Regel 3, 5, 6: höj vikten efter max reps på alla set.
  let streak = 0;
  for (let i = basis.length - 1; i >= 0; i--) {
    const e = basis[i];
    if (!sameWeight(e, last) || !allMax(e, p, W)) break;
    streak++;
  }
  const needed = requiresTwice(ex, W, rules) ? 2 : 1;

  if (streak >= 1 && ex.step === 0) {
    return {
      kind: 'max-reps',
      sets: uniform(p.sets, W, p.repMax),
      rir: p.rir,
      reason: 'Max reps på alla set – håll kvar, eller byt till en tyngre variant',
      wellnessNotice: missMin || backsliding ? true : undefined,
    };
  }
  if (streak >= needed) {
    const nw = Math.round((W + ex.step) * 100) / 100;
    return {
      kind: 'okning',
      sets: uniform(p.sets, nw, p.repMin),
      rir: p.rir,
      reason: ex.bodyweight
        ? `Max reps klart – lägg på ${fmt(ex.step)} kg extravikt (${fmt(nw)} kg)`
        : `Max reps på alla set – höj till ${fmt(nw)} kg`,
    };
  }
  if (streak >= 1) {
    return {
      kind: 'upprepa-max',
      sets: uniform(p.sets, W, p.repMax),
      rir: p.rir,
      reason: 'Max reps på alla set – en gång till innan vikten höjs (stort steg)',
    };
  }

  // Regel 4: samma vikt, +1 rep på minst ett set.
  const reps = plusOneRep(normalizeReps(last.sets, p.sets, p.repMin), p.repMax);
  return {
    kind: 'reps',
    sets: reps.map((r) => ({ weight: W, reps: r })),
    rir: p.rir,
    reason: 'Samma vikt, +1 rep',
    wellnessNotice: missMin || backsliding ? true : undefined,
  };
}

/** Uppvärmningsset (ca 40/60/80 %) för första basövningen. */
export function warmupSets(workW: number, ex: ExerciseInfo, rules = PROGRESSION): LoggedSet[] {
  if (workW <= 0) return [];
  const g = grid(ex);
  const out: LoggedSet[] = [];
  rules.warmupPercents.forEach((pct, i) => {
    const w = Math.max(ex.kind === 'skivstång' ? 20 : g, Math.round((workW * pct) / g) * g);
    if (!out.length || out[out.length - 1].weight < w) out.push({ weight: w, reps: rules.warmupReps[i] });
  });
  return out.filter((s) => s.weight < workW);
}

// ---------------------------------------------------------------------------
// Volymförslag (regel 11)
// ---------------------------------------------------------------------------

export interface WeekScore {
  week: string; // måndagens datum
  weight: number;
  reps: number;
}

/** Bästa insatsen per vecka för en övning (vikt först, sedan totala reps). */
export function weeklyScores(history: HistoryEntry[]): WeekScore[] {
  const byWeek = new Map<string, WeekScore>();
  for (const h of history) {
    if (h.mode !== 'normal' || !h.sets.length) continue;
    const week = mondayKey(h.date);
    const s = { week, weight: workWeight(h.sets), reps: totalReps(h.sets) };
    const cur = byWeek.get(week);
    if (!cur || better(s, cur)) byWeek.set(week, s);
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
}

function better(a: WeekScore, b: WeekScore) {
  return a.weight > b.weight + 1e-9 || (Math.abs(a.weight - b.weight) < 1e-9 && a.reps > b.reps);
}

function mondayKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Har övningen ökat `weeks` veckor i rad (bland veckor med vanliga pass)? */
export function increasedWeeksInRow(history: HistoryEntry[], weeks: number): boolean {
  const s = weeklyScores(history);
  if (s.length < weeks + 1) return false;
  const tail = s.slice(-(weeks + 1));
  for (let i = 1; i < tail.length; i++) if (!better(tail[i], tail[i - 1])) return false;
  return true;
}

export interface VolumeCandidate {
  slotId: string;
  exerciseId: string;
  sets: number;
}

/**
 * Om ALLA övningar i muskelgruppen har ökat tre veckor i rad: föreslå +1 set
 * på den övning som har minst set (max 4). Returnerar null om inget förslag.
 */
export function volumeSuggestion(
  group: VolumeCandidate[],
  historyFor: (exerciseId: string) => HistoryEntry[],
  rules = PROGRESSION,
): { slotId: string; exerciseId: string; from: number; to: number } | null {
  if (!group.length) return null;
  if (!group.every((g) => increasedWeeksInRow(historyFor(g.exerciseId), rules.volumeWeeksInRow))) return null;
  const pick = [...group].filter((g) => g.sets < rules.maxSetsPerExercise).sort((a, b) => a.sets - b.sets)[0];
  if (!pick) return null;
  return { slotId: pick.slotId, exerciseId: pick.exerciseId, from: pick.sets, to: pick.sets + 1 };
}
