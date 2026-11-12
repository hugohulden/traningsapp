import { describe, expect, it } from 'vitest';
import {
  computeTarget,
  epley,
  bestSet,
  plusOneRep,
  reducedWeight,
  warmupSets,
  increasedWeeksInRow,
  volumeSuggestion,
  type HistoryEntry,
  type ExerciseInfo,
} from './progression';
import type { Prescription } from '../plan/types';

const barbell: ExerciseInfo = { kind: 'skivstång', step: 2.5 };
const squat: ExerciseInfo = { kind: 'skivstång', step: 5 };
const dumbbell: ExerciseInfo = { kind: 'hantlar', step: 2 };
const machine: ExerciseInfo = { kind: 'maskin', step: 5 };
const chins: ExerciseInfo = { kind: 'kroppsvikt', step: 2.5, bodyweight: true };
const legRaise: ExerciseInfo = { kind: 'kroppsvikt', step: 0, bodyweight: true };

const p = (sets: number, repMin: number, repMax: number): Prescription => ({ sets, repMin, repMax, rir: [1, 2] });
const s = (weight: number, ...reps: number[]) => reps.map((r) => ({ weight, reps: r }));
let day = 1;
const h = (sets: { weight: number; reps: number; rir?: number }[], mode: HistoryEntry['mode'] = 'normal'): HistoryEntry => ({
  date: `2026-12-${String(day++).padStart(2, '0')}`,
  mode,
  sets,
});

describe('regel 3: max reps på alla set → höj ett steg, reps till botten', () => {
  it('bänkpress 80 × 8, 8, 8 (5–8) → 82,5 × 5', () => {
    const t = computeTarget({ exercise: barbell, prescription: p(3, 5, 8), mode: 'normal', history: [h(s(80, 8, 8, 8))] });
    expect(t.kind).toBe('okning');
    expect(t.sets).toEqual([
      { weight: 82.5, reps: 5 },
      { weight: 82.5, reps: 5 },
      { weight: 82.5, reps: 5 },
    ]);
  });
  it('kräver att alla set når max', () => {
    const t = computeTarget({ exercise: barbell, prescription: p(3, 5, 8), mode: 'normal', history: [h(s(80, 8, 8, 7))] });
    expect(t.kind).toBe('reps');
    expect(t.sets.map((x) => x.reps)).toEqual([8, 8, 8]);
    expect(t.sets.every((x) => x.weight === 80)).toBe(true);
  });
  it('färre set än planerat räknas inte som max', () => {
    const t = computeTarget({ exercise: barbell, prescription: p(3, 5, 8), mode: 'normal', history: [h(s(80, 8, 8))] });
    expect(t.kind).toBe('reps');
  });
});

describe('regel 4: samma vikt, +1 rep på minst ett set', () => {
  it('8, 7, 6 → 8, 8, 7 (exemplet)', () => {
    expect(plusOneRep([8, 7, 6], 12)).toEqual([8, 8, 7]);
    const t = computeTarget({ exercise: machine, prescription: p(3, 8, 12), mode: 'normal', history: [h(s(50, 8, 7, 6))] });
    expect(t.kind).toBe('reps');
    expect(t.sets).toEqual([
      { weight: 50, reps: 8 },
      { weight: 50, reps: 8 },
      { weight: 50, reps: 7 },
    ]);
  });
  it('8, 8, 8 → 9, 8, 8', () => expect(plusOneRep([8, 8, 8], 12)).toEqual([9, 8, 8]));
  it('6, 8, 8 → 7, 8, 8', () => expect(plusOneRep([6, 8, 8], 12)).toEqual([7, 8, 8]));
  it('12, 12, 11 → 12, 12, 12 (taket är max)', () => expect(plusOneRep([12, 12, 11], 12)).toEqual([12, 12, 12]));
  it('alltid minst ett set högre så länge något set är under max', () => {
    for (const prev of [[5, 5, 5], [7, 5, 6], [10, 10, 9], [4, 3, 3]]) {
      const t = plusOneRep(prev, 10);
      expect(t.reduce((a, b) => a + b)).toBeGreaterThan(prev.reduce((a, b) => a + b));
    }
  });
});

describe('regel 5: stora steg (hantlar, >5 %) kräver max två pass i rad', () => {
  it('hantlar: första passet på max → upprepa samma', () => {
    const t = computeTarget({ exercise: dumbbell, prescription: p(3, 8, 10), mode: 'normal', history: [h(s(16, 10, 10, 10))] });
    expect(t.kind).toBe('upprepa-max');
    expect(t.sets.every((x) => x.weight === 16 && x.reps === 10)).toBe(true);
  });
  it('hantlar: två pass i rad på max → nästa hantelpar', () => {
    const t = computeTarget({
      exercise: dumbbell,
      prescription: p(3, 8, 10),
      mode: 'normal',
      history: [h(s(16, 10, 10, 10)), h(s(16, 10, 10, 10))],
    });
    expect(t.kind).toBe('okning');
    expect(t.sets[0]).toEqual({ weight: 18, reps: 8 });
  });
  it('hantlar: max, sedan miss → inte höjning', () => {
    const t = computeTarget({
      exercise: dumbbell,
      prescription: p(3, 8, 10),
      mode: 'normal',
      history: [h(s(16, 10, 10, 10)), h(s(16, 10, 10, 9))],
    });
    expect(t.kind).toBe('reps');
  });
  it('maskin där steget är >5 % (5 kg på 40 kg) kräver två pass', () => {
    const t = computeTarget({ exercise: machine, prescription: p(3, 8, 12), mode: 'normal', history: [h(s(40, 12, 12, 12))] });
    expect(t.kind).toBe('upprepa-max');
  });
  it('maskin där steget är ≤5 % (5 kg på 120 kg) höjs direkt', () => {
    const t = computeTarget({ exercise: machine, prescription: p(3, 8, 12), mode: 'normal', history: [h(s(120, 12, 12, 12))] });
    expect(t.kind).toBe('okning');
    expect(t.sets[0].weight).toBe(125);
  });
  it('knäböj 47,5 kg med 5 kg-steg (10,5 %) kräver två pass', () => {
    const t1 = computeTarget({ exercise: squat, prescription: p(3, 4, 6), mode: 'normal', history: [h(s(47.5, 6, 6, 6))] });
    expect(t1.kind).toBe('upprepa-max');
    const t2 = computeTarget({ exercise: squat, prescription: p(3, 4, 6), mode: 'normal', history: [h(s(47.5, 6, 6, 6)), h(s(47.5, 6, 6, 6))] });
    expect(t2.sets[0]).toEqual({ weight: 52.5, reps: 4 });
  });
  it('bänk 2,5 kg på 55 kg (4,5 %) höjs direkt', () => {
    const t = computeTarget({ exercise: barbell, prescription: p(3, 5, 8), mode: 'normal', history: [h(s(55, 8, 8, 8))] });
    expect(t.kind).toBe('okning');
  });
});

describe('regel 6: kroppsviktsövningar', () => {
  it('chins: reps ökar mot max', () => {
    const t = computeTarget({ exercise: chins, prescription: p(3, 5, 10), mode: 'normal', history: [h(s(0, 8, 8, 6))] });
    expect(t.kind).toBe('reps');
    expect(t.sets.map((x) => x.reps)).toEqual([8, 8, 7]);
    expect(t.sets[0].weight).toBe(0);
  });
  it('chins: max reps → +2,5 kg extravikt, börja om från min', () => {
    const t = computeTarget({ exercise: chins, prescription: p(3, 5, 10), mode: 'normal', history: [h(s(0, 10, 10, 10))] });
    expect(t.kind).toBe('okning');
    expect(t.sets).toEqual([
      { weight: 2.5, reps: 5 },
      { weight: 2.5, reps: 5 },
      { weight: 2.5, reps: 5 },
    ]);
  });
  it('chins med extravikt: 2,5 → 5 kg', () => {
    const t = computeTarget({ exercise: chins, prescription: p(3, 5, 10), mode: 'normal', history: [h(s(2.5, 10, 10, 10))] });
    expect(t.sets[0]).toEqual({ weight: 5, reps: 5 });
  });
  it('hängande benlyft (bara reps): stannar på max', () => {
    const t = computeTarget({ exercise: legRaise, prescription: p(3, 8, 15), mode: 'normal', history: [h(s(0, 15, 15, 15))] });
    expect(t.kind).toBe('max-reps');
    expect(t.sets.every((x) => x.reps === 15 && x.weight === 0)).toBe(true);
  });
});

describe('regel 7: sänkning vid stagnation', () => {
  it('under min-reps på första setet två pass i rad → sänk 5–10 %, notis', () => {
    const t = computeTarget({
      exercise: barbell,
      prescription: p(3, 5, 8),
      mode: 'normal',
      history: [h(s(80, 4, 4, 3)), h(s(80, 4, 3, 3))],
    });
    expect(t.kind).toBe('sankning');
    expect(t.wellnessNotice).toBe(true);
    const w = t.sets[0].weight!;
    expect(w).toBeLessThanOrEqual(80 * 0.95);
    expect(w).toBeGreaterThanOrEqual(80 * 0.9);
    expect(t.sets[0].reps).toBe(5);
  });
  it('bara ett pass under min → ingen sänkning', () => {
    const t = computeTarget({ exercise: barbell, prescription: p(3, 5, 8), mode: 'normal', history: [h(s(80, 6, 6, 6)), h(s(80, 4, 4, 4))] });
    expect(t.kind).toBe('reps');
  });
  it('backat två pass i rad → sänk', () => {
    const t = computeTarget({
      exercise: machine,
      prescription: p(3, 8, 12),
      mode: 'normal',
      history: [h(s(100, 11, 10, 10)), h(s(100, 10, 10, 9)), h(s(100, 9, 9, 8))],
    });
    expect(t.kind).toBe('sankning');
    expect(t.sets[0].weight).toBe(90); // 100 × 0,925 = 92,5 → nedåt till 5-steg = 90
    expect(t.wellnessNotice).toBe(true);
  });
  it('backat bara en gång → ingen sänkning', () => {
    const t = computeTarget({
      exercise: machine,
      prescription: p(3, 8, 12),
      mode: 'normal',
      history: [h(s(100, 9, 9, 8)), h(s(100, 11, 10, 10)), h(s(100, 10, 10, 9))],
    });
    expect(t.kind).toBe('reps');
  });
  it('sänkning avrundas till rätt steg och är minst ett steg', () => {
    expect(reducedWeight(16, dumbbell, 0.075)).toBe(14);
    expect(reducedWeight(60, squat, 0.075)).toBe(55);
    expect(reducedWeight(30, machine, 0.075)).toBe(25);
  });
});

describe('regel 8: deload', () => {
  it('samma vikt, ett set färre, RIR 3–4', () => {
    const t = computeTarget({ exercise: barbell, prescription: p(3, 5, 8), mode: 'deload', history: [h(s(80, 7, 6, 6))] });
    expect(t.kind).toBe('deload');
    expect(t.sets.length).toBe(2);
    expect(t.sets.every((x) => x.weight === 80)).toBe(true);
    expect(t.rir).toEqual([3, 4]);
  });
  it('veckan efter fortsätter från senaste vanliga passet', () => {
    const t = computeTarget({
      exercise: barbell,
      prescription: p(3, 5, 8),
      mode: 'normal',
      history: [h(s(80, 8, 7, 6)), h(s(80, 5, 5), 'deload')],
    });
    expect(t.kind).toBe('reps');
    expect(t.sets.map((x) => x.reps)).toEqual([8, 8, 7]);
  });
  it('max före deload → höjning efter deload', () => {
    const t = computeTarget({
      exercise: barbell,
      prescription: p(3, 5, 8),
      mode: 'normal',
      history: [h(s(80, 8, 8, 8)), h(s(80, 5, 5), 'deload')],
    });
    expect(t.kind).toBe('okning');
  });
});

describe('regel 9: kalibrering och startvikter', () => {
  it('ingen historik → kalibrering utan vikt', () => {
    const t = computeTarget({ exercise: machine, prescription: p(3, 8, 12), mode: 'normal', history: [] });
    expect(t.kind).toBe('kalibrering');
    expect(t.sets.every((x) => x.weight === null)).toBe(true);
  });
  it('kroppsviktsövning kalibreras med 0 kg extravikt', () => {
    const t = computeTarget({ exercise: legRaise, prescription: p(3, 8, 15), mode: 'normal', history: [] });
    expect(t.kind).toBe('kalibrering');
    expect(t.sets.every((x) => x.weight === 0)).toBe(true);
  });
  it('startpunkt används när historik saknas', () => {
    const t = computeTarget({ exercise: squat, prescription: p(3, 4, 6), mode: 'normal', history: [], start: { weight: 47.5, reps: [4, 4, 4] } });
    expect(t.kind).toBe('start');
    expect(t.sets[0]).toEqual({ weight: 47.5, reps: 4 });
  });
  it('första loggade passet blir bas', () => {
    const t = computeTarget({ exercise: machine, prescription: p(3, 8, 12), mode: 'normal', history: [h(s(45, 10, 9, 8))] });
    expect(t.sets).toEqual([
      { weight: 45, reps: 10 },
      { weight: 45, reps: 10 },
      { weight: 45, reps: 9 },
    ]);
  });
});

describe('regel 10: Epley', () => {
  it('100 × 5 → 116,7', () => expect(epley(100, 5)).toBeCloseTo(116.67, 1));
  it('bästa set', () => {
    const b = bestSet(s(80, 8, 6).concat(s(85, 5)));
    expect(b!.set.weight).toBe(80);
    expect(b!.e1rm).toBeCloseTo(101.33, 1);
  });
});

describe('fas 3: underhåll', () => {
  const mp: Prescription = { sets: 2, repMin: 3, repMax: 5, rir: [2, 3] };
  it('håller vikten från senaste passet', () => {
    const t = computeTarget({ exercise: squat, prescription: mp, mode: 'underhall', history: [h(s(70, 6, 5, 5))] });
    expect(t.kind).toBe('underhall');
    expect(t.sets).toEqual([
      { weight: 70, reps: 5 },
      { weight: 70, reps: 5 },
    ]);
    expect(t.suggestion).toBeUndefined();
  });
  it('föreslår höjning (men tillämpar inte) om förra passet var klart lättare', () => {
    const t = computeTarget({
      exercise: squat,
      prescription: mp,
      mode: 'underhall',
      history: [h([{ weight: 70, reps: 5, rir: 5 }, { weight: 70, reps: 5, rir: 5 }], 'underhall')],
    });
    expect(t.sets[0].weight).toBe(70);
    expect(t.suggestion).toContain('75');
  });
});

describe('uppvärmning', () => {
  it('ca 40/60/80 %', () => {
    expect(warmupSets(50, barbell).map((x) => x.weight)).toEqual([20, 30, 40]);
    expect(warmupSets(100, barbell).map((x) => x.weight)).toEqual([40, 60, 80]);
  });
});

describe('regel 11: volymförslag', () => {
  const weekly = (start: number, ...weights: number[]): HistoryEntry[] =>
    weights.map((w, i) => {
      const d = new Date(2026, 10, 16 + 7 * i + start);
      return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, mode: 'normal', sets: s(w, 8, 8, 8) };
    });
  it('tre veckors ökning i rad krävs', () => {
    expect(increasedWeeksInRow(weekly(0, 50, 52.5, 55, 57.5), 3)).toBe(true);
    expect(increasedWeeksInRow(weekly(0, 50, 52.5, 52.5, 55), 3)).toBe(false);
    expect(increasedWeeksInRow(weekly(0, 50, 52.5, 55), 3)).toBe(false);
  });
  it('fler reps på samma vikt räknas som ökning', () => {
    const hist: HistoryEntry[] = [
      { date: '2026-11-16', mode: 'normal', sets: s(50, 8, 7, 6) },
      { date: '2026-11-23', mode: 'normal', sets: s(50, 8, 8, 7) },
      { date: '2026-11-30', mode: 'normal', sets: s(50, 8, 8, 8) },
      { date: '2026-12-07', mode: 'normal', sets: s(52.5, 5, 5, 5) },
    ];
    expect(increasedWeeksInRow(hist, 3)).toBe(true);
  });
  it('alla övningar i gruppen måste ha ökat; förslag på den med minst set', () => {
    const map: Record<string, HistoryEntry[]> = {
      bank: weekly(0, 50, 52.5, 55, 57.5),
      flyes: weekly(4, 30, 35, 40, 45),
    };
    const sug = volumeSuggestion(
      [
        { slotId: 'B1', exerciseId: 'bank', sets: 3 },
        { slotId: 'C4', exerciseId: 'flyes', sets: 2 },
      ],
      (id) => map[id],
    );
    expect(sug).toEqual({ slotId: 'C4', exerciseId: 'flyes', from: 2, to: 3 });
    map.flyes = weekly(4, 30, 35, 35, 45);
    expect(volumeSuggestion([{ slotId: 'B1', exerciseId: 'bank', sets: 3 }, { slotId: 'C4', exerciseId: 'flyes', sets: 2 }], (id) => map[id])).toBeNull();
  });
  it('aldrig mer än 4 set', () => {
    const map = { bank: weekly(0, 50, 52.5, 55, 57.5) };
    expect(volumeSuggestion([{ slotId: 'B1', exerciseId: 'bank', sets: 4 }], (id) => map[id as 'bank'])).toBeNull();
  });
});
