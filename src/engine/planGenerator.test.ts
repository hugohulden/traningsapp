import { describe, expect, it } from 'vitest';
import {
  buildSequence,
  getWeekPlan,
  marathonLayout,
  scheduleWarnings,
  splitWeekKm,
  weekIndexForDate,
  type PlanContext,
} from './planGenerator';
import { PLAN_WEEKS } from '../plan/config';
import { DEFAULT_SETTINGS } from '../plan/settings';
import { hmPrediction, thresholdFromTest, qualityKm } from './running';
import { resolveSlots } from './gymPlan';
import { weekday } from '../lib/dates';

const ctx: PlanContext = { ...DEFAULT_SETTINGS };

// Tabellen i avsnitt 7, ordagrant.
const TABLE: [number, string, string, number | null, string, string][] = [
  [1, '2026-11-16', 'Fas 1 Bas', 30, '12', '5 × 4 min VO2, 2 min jogg'],
  [2, '2026-11-23', 'Fas 1 Bas', 32, '13', '3 × 8 min tröskel, 2 min jogg'],
  [3, '2026-11-30', 'Fas 1 Bas', 35, '14', '6 × 4 min VO2'],
  [4, '2026-12-07', 'Fas 1 Bas D', 27, '11', '2 × 8 min tröskel'],
  [5, '2026-12-14', 'Fas 1 Bas', 35, '15', '3 × 10 min tröskel'],
  [6, '2026-12-21', 'Fas 1 Bas', 37, '16', '5 × 1000 m VO2, 2 min vila'],
  [7, '2026-12-28', 'Fas 1 Bas', 40, '17', '4 × 8 min tröskel'],
  [8, '2027-01-04', 'Fas 1 Bas D', 30, '12', 'TEST 5 km'],
  [9, '2027-01-11', 'Fas 1 Bas', 40, '17', '2 × 15 min tröskel'],
  [10, '2027-01-18', 'Fas 1 Bas', 42, '18', '6 × 1000 m VO2'],
  [11, '2027-01-25', 'Fas 2 Tröskel', 44, '18', '3 × 12 min tröskel'],
  [12, '2027-02-01', 'Fas 2 Tröskel D', 33, '14', '3 × 8 min tröskel'],
  [13, '2027-02-08', 'Fas 2 Tröskel', 44, '19', '2 × 20 min tröskel'],
  [14, '2027-02-15', 'Fas 2 Tröskel', 46, '20', '5 × 1000 m VO2'],
  [15, '2027-02-22', 'Fas 2 Tröskel', 48, '20, sista 4 km steady', '30 min tempo'],
  [16, '2027-03-01', 'Fas 2 Tröskel D', 36, '15', 'TEST 10 km'],
  [17, '2027-03-08', 'Fas 2 Tröskel', 48, '21', '4 × 10 min tröskel'],
  [18, '2027-03-15', 'Fas 2 Tröskel', 50, '22', '35 min tempo'],
  [19, '2027-03-22', 'Fas 3 Specifik', 50, '20, varav 2 × 3 km halvmarafart', '3 × 3 km halvmarafart, 3 min jogg'],
  [20, '2027-03-29', 'Fas 3 Specifik D', 38, '16', '4 × 2 km halvmarafart'],
  [21, '2027-04-05', 'Fas 3 Specifik', 50, '22', '2 × 5 km halvmarafart'],
  [22, '2027-04-12', 'Fas 3 Specifik', 52, '20, sista 6 km halvmarafart', '6 × 1000 m VO2'],
  [23, '2027-04-19', 'Fas 3 Specifik', 52, '22', '10 km i halvmarafart (eller 10 km-lopp)'],
  [24, '2027-04-26', 'Fas 3 Specifik D', 40, '16', '3 × 3 km halvmarafart'],
  [25, '2027-05-03', 'Fas 3 Specifik', 48, '18, sista 5 km halvmarafart', '3 × 4 km halvmarafart'],
  [26, '2027-05-10', 'Nedtrappning', 34, '13', '3 × 2 km halvmarafart'],
  [27, '2027-05-17', 'Tävling', null, 'LOPP lör 22 maj', 'Tis: 7 km med 3 × 1 km halvmarafart. Tor: 4 km lugnt + stegringslopp'],
];

describe('veckoplanen stämmer exakt med tabellen (v1–27)', () => {
  it('27 veckor', () => expect(PLAN_WEEKS.length).toBe(27));
  for (const [v, start, phase, km, long, quality] of TABLE) {
    it(`vecka ${v}`, () => {
      const w = getWeekPlan(v - 1, ctx);
      expect(w.label).toBe(`Vecka ${v}`);
      expect(w.start).toBe(start);
      expect(weekday(w.start)).toBe(0);
      expect(w.planWeek).toBe(v);
      expect(`${w.phaseName}${w.deload ? ' D' : ''}`).toBe(phase);
      expect(w.kmTarget).toBe(km);
      if (v < 27) {
        expect(w.def!.long!.text).toBe(long);
        expect(w.def!.quality!.text).toBe(quality);
        const l = w.sessions.find((s) => s.key === 'long')!;
        expect(l.run!.km).toBe(Number(long.split(',')[0]));
        expect(l.date).toBe(addDaysTest(start, 6));
      }
    });
  }
  it('loppet ligger lördag 22 maj 2027 i vecka 27', () => {
    const w = getWeekPlan(26, ctx);
    const race = w.sessions.find((s) => s.key === 'race')!;
    expect(race.date).toBe('2027-05-22');
    expect(race.run!.km).toBeCloseTo(21.1, 1);
    expect(w.sessions.find((s) => s.key === 'tune')!.run!.text).toBe('7 km med 3 × 1 km halvmarafart');
    expect(w.sessions.find((s) => s.key === 'shake')!.run!.text).toBe('4 km lugnt + stegringslopp');
  });
  it('datum till vecka', () => {
    expect(weekIndexForDate('2026-11-16')).toBe(0);
    expect(weekIndexForDate('2026-11-22')).toBe(0);
    expect(weekIndexForDate('2026-11-23')).toBe(1);
    expect(weekIndexForDate('2027-05-22')).toBe(26);
    expect(weekIndexForDate('2026-11-12')).toBe(-1);
  });
});

function addDaysTest(d: string, n: number) {
  const [y, m, day] = d.split('-').map(Number);
  const x = new Date(y, m - 1, day + n, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

describe('veckostruktur', () => {
  it('normal vecka: mån A, tis lugn, ons B, tor kvalitet, fre C, sön lång', () => {
    const w = getWeekPlan(0, ctx);
    const byKey = Object.fromEntries(w.sessions.map((s) => [s.key, s.day]));
    expect(byKey).toMatchObject({ gymA: 0, easy: 1, gymB: 2, quality: 3, gymC: 4, long: 6 });
  });
  it('tävlingsveckan: bara lätt Gym B på måndagen, inget benpass', () => {
    const w = getWeekPlan(26, ctx);
    const gyms = w.sessions.filter((s) => s.kind === 'gym');
    expect(gyms.length).toBe(1);
    expect(gyms[0].gym).toMatchObject({ template: 'B', deload: true });
    expect(gyms[0].day).toBe(0);
  });
  it('deloadveckor för gym = löpningens deloadveckor', () => {
    for (const v of [4, 8, 12, 16, 20, 24]) {
      const w = getWeekPlan(v - 1, ctx);
      expect(w.deload).toBe(true);
      expect(w.sessions.filter((s) => s.kind === 'gym').every((s) => s.gym!.deload)).toBe(true);
    }
    expect(getWeekPlan(4, ctx).sessions.find((s) => s.key === 'gymA')!.gym!.deload).toBe(false);
  });
});

describe('km-regler', () => {
  it('vecka 1: tisdag = 30 − 12 − kvalitet (≈10 km) ≈ 8 km', () => {
    const w = getWeekPlan(0, ctx);
    const q = w.sessions.find((s) => s.key === 'quality')!.run!.km;
    expect(q).toBeCloseTo(10, 0);
    const easy = w.sessions.find((s) => s.key === 'easy')!.run!.km;
    expect(easy).toBe(8);
    expect(w.sessions.find((s) => s.key === 'extra')).toBeUndefined();
  });
  it('tisdagen är aldrig över 12 km', () => {
    for (let i = 0; i < 26; i++) {
      const e = getWeekPlan(i, ctx).sessions.find((s) => s.key === 'easy');
      if (e) expect(e.run!.km).toBeLessThanOrEqual(12);
    }
  });
  it('överskott ≥ 4 km → valfritt lördagspass 4–8 km; resten flyttas aldrig till andra pass', () => {
    for (let i = 0; i < 26; i++) {
      const w = getWeekPlan(i, ctx);
      const extra = w.sessions.find((s) => s.key === 'extra');
      if (extra) {
        expect(extra.optional).toBe(true);
        expect(extra.day).toBe(5);
        expect(extra.run!.km).toBeGreaterThanOrEqual(4);
        expect(extra.run!.km).toBeLessThanOrEqual(8);
      }
      // Långpass och kvalitetspass påverkas inte av överskottet.
      expect(w.sessions.find((s) => s.key === 'long')!.run!.km).toBe(w.def!.long!.km);
      // Planerat ≤ veckomål (+ avrundning)
      expect(w.kmPlanned).toBeLessThanOrEqual(w.kmTarget! + 0.5);
    }
  });
  it('vecka 22: överskott över 8 km kapas till 8', () => {
    const w = getWeekPlan(21, ctx);
    expect(w.sessions.find((s) => s.key === 'easy')!.run!.km).toBe(12);
    expect(w.sessions.find((s) => s.key === 'extra')!.run!.km).toBe(8);
  });
  it('vecka 10: litet överskott (< 4 km) stryks', () => {
    const w = getWeekPlan(9, ctx);
    expect(w.sessions.find((s) => s.key === 'easy')!.run!.km).toBe(12);
    expect(w.sessions.find((s) => s.key === 'extra')).toBeUndefined();
  });
  it('kvalitetspass: 2 km uppvärmning + 2 km nedjogg + arbete + jogg', () => {
    const q = qualityKm(PLAN_WEEKS[5].quality!, ctx); // 5 × 1000 m, 2 min vila
    expect(q.work).toBe(5);
    expect(q.total).toBe(9);
    const t = qualityKm(PLAN_WEEKS[7].quality!, ctx); // TEST 5 km
    expect(t.total).toBe(9);
  });
  it('snabbare T ger kortare tidsbaserade pass och längre tisdag', () => {
    const slow = splitWeekKm(30, 12, PLAN_WEEKS[0].quality!, ctx);
    const fast = splitWeekKm(30, 12, PLAN_WEEKS[0].quality!, { ...ctx, thresholdSec: 250 });
    expect(fast.quality).toBeGreaterThan(slow.quality);
  });
});

describe('missad vecka och omstart', () => {
  it('missad vecka upprepas, fas 2 kortas (v18 stryks), loppet flyttas inte', () => {
    const seq = buildSequence([{ index: 2, restart: false }]);
    expect(seq.length).toBe(27);
    expect(seq.map((e) => e.week).slice(0, 5)).toEqual([1, 2, 3, 3, 4]);
    expect(seq.some((e) => e.week === 18)).toBe(false);
    expect(seq[26].week).toBe(27);
    const c = { ...ctx, missedWeeks: [{ index: 2, restart: false }] };
    const w = getWeekPlan(3, c);
    expect(w.planWeek).toBe(3);
    expect(w.repeated).toBe(true);
    expect(getWeekPlan(26, c).sessions.find((s) => s.key === 'race')!.date).toBe('2027-05-22');
  });
  it('två missade veckor stryker v18 och v17', () => {
    const seq = buildSequence([
      { index: 2, restart: false },
      { index: 6, restart: false },
    ]);
    expect(seq.length).toBe(27);
    const weeks = seq.map((e) => e.week);
    expect(weeks).not.toContain(18);
    expect(weeks).not.toContain(17);
    expect(weeks[26]).toBe(27);
  });
  it('omstart efter 7+ dagar: 75 % av veckomålet', () => {
    const c = { ...ctx, missedWeeks: [{ index: 4, restart: true }] };
    const w = getWeekPlan(5, c);
    expect(w.planWeek).toBe(5);
    expect(w.restart).toBe(true);
    expect(w.kmTarget).toBe(26.5); // 35 × 0,75 = 26,25 → 26,5
    expect(w.sessions.find((s) => s.key === 'long')!.run!.km).toBe(11.5); // 15 × 0,75 = 11,25 → 11,5
  });
  it('missad vecka i fas 3 stryker en fas 3-vecka (fas 2 redan passerad)', () => {
    const seq = buildSequence([{ index: 20, restart: false }]);
    expect(seq.length).toBe(27);
    expect(seq[26].week).toBe(27);
    expect(seq.map((e) => e.week).filter((w) => w === 21).length).toBe(2);
  });
});

describe('flytta pass och varningar', () => {
  it('standardveckan ger inga varningar', () => {
    for (let i = 0; i < 27; i++) expect(scheduleWarnings(getWeekPlan(i, ctx).sessions)).toEqual([]);
  });
  it('benpass flyttat till dagen före kvalitetspasset → varning', () => {
    const w = getWeekPlan(0, { ...ctx, dayOverrides: { '0:gymA': 2 } });
    expect(w.sessions.find((s) => s.key === 'gymA')!.day).toBe(2);
    const warns = scheduleWarnings(w.sessions);
    expect(warns.some((x) => x.text.includes('48 h') && x.text.includes('kvalitetspass'))).toBe(true);
  });
  it('benpass två dagar före långpasset → varning', () => {
    const w = getWeekPlan(0, { ...ctx, dayOverrides: { '0:gymA': 4 } });
    expect(scheduleWarnings(w.sessions).some((x) => x.text.includes('långpass'))).toBe(true);
  });
  it('två hårda löppass i rad → varning', () => {
    const w = getWeekPlan(0, { ...ctx, dayOverrides: { '0:quality': 5 } });
    expect(scheduleWarnings(w.sessions).some((x) => x.text.includes('två dagar i rad'))).toBe(true);
  });
});

describe('gym per fas', () => {
  it('fas 1–2: Gym A normal med 3 set', () => {
    const a = getWeekPlan(0, ctx).sessions.find((s) => s.key === 'gymA')!;
    const slots = resolveSlots(a.gym!, ctx as never);
    expect(slots.find((s) => s.slotId === 'A1')!.prescription).toMatchObject({ sets: 3, repMin: 4, repMax: 6 });
    expect(slots[0].mode).toBe('normal');
  });
  it('fas 3: Gym A underhåll (knäböj 2 × 3–5, RDL 2 × 6, benpress 2 × 8–10)', () => {
    const a = getWeekPlan(18, ctx).sessions.find((s) => s.key === 'gymA')!;
    const slots = resolveSlots(a.gym!, { extraSets: {} });
    expect(slots.find((s) => s.slotId === 'A1')!.prescription).toMatchObject({ sets: 2, repMin: 3, repMax: 5 });
    expect(slots.find((s) => s.slotId === 'A2')!.prescription).toMatchObject({ sets: 2, repMin: 6, repMax: 6 });
    expect(slots.find((s) => s.slotId === 'A3')!.prescription).toMatchObject({ sets: 2, repMin: 8, repMax: 10 });
    expect(slots.every((s) => s.mode === 'underhall')).toBe(true);
    expect(slots.every((s) => s.prescription.rir[0] >= 1)).toBe(true);
  });
  it('fas 3: fredagens valfria benblock tas bort', () => {
    const c1 = resolveSlots(getWeekPlan(0, ctx).sessions.find((s) => s.key === 'gymC')!.gym!, { extraSets: {} });
    const c3 = resolveSlots(getWeekPlan(18, ctx).sessions.find((s) => s.key === 'gymC')!.gym!, { extraSets: {} });
    expect(c1.some((s) => s.slotId === 'C8')).toBe(true);
    expect(c3.some((s) => s.slotId === 'C8' || s.slotId === 'C9')).toBe(false);
  });
  it('vecka 26: Gym A med 2 set per övning', () => {
    const slots = resolveSlots(getWeekPlan(25, ctx).sessions.find((s) => s.key === 'gymA')!.gym!, { extraSets: {} });
    expect(slots.every((s) => s.prescription.sets === 2)).toBe(true);
  });
  it('godkänt volymförslag ger +1 set', () => {
    const slots = resolveSlots({ template: 'B', deload: false, variant: 'normal' }, { extraSets: { B1: 1 } });
    expect(slots.find((s) => s.slotId === 'B1')!.prescription.sets).toBe(4);
  });
});

describe('fartzoner och prognos', () => {
  it('T från 5 km: 20:00 → 4:16', () => expect(thresholdFromTest('5k', 20 * 60)).toBe(256));
  it('T från 10 km: 41:08 → 4:14', () => expect(thresholdFromTest('10k', 41 * 60 + 8)).toBe(254));
  it('halvmaraprognos', () => {
    expect(Math.round(hmPrediction('10k', 41 * 60 + 8))).toBe(5446); // 1:30:46
    expect(hmPrediction('5k', 20 * 60)).toBe(5520); // 1:32:00
  });
});

describe('efter loppet', () => {
  it('2 veckor återhämtning', () => {
    expect(getWeekPlan(27, ctx).kind).toBe('aterhamtning');
    expect(getWeekPlan(28, ctx).kind).toBe('aterhamtning');
    expect(getWeekPlan(29, ctx).kind).toBe('fri');
  });
  it('marathonblock 16–18 veckor genereras när datum anges', () => {
    const c = { ...ctx, marathonDate: '2027-10-10' };
    const L = marathonLayout(c.marathonDate)!;
    expect(L.blockWeeks).toBe(18);
    const first = getWeekPlan(L.blockStartIndex, c);
    expect(first.kind).toBe('marathon');
    expect(first.sessions.filter((s) => s.kind === 'run').length).toBe(4);
    const race = getWeekPlan(L.raceIndex, c).sessions.find((s) => s.key === 'race')!;
    expect(race.date).toBe('2027-10-10');
    const longs = Array.from({ length: L.blockWeeks }, (_, i) => getWeekPlan(L.blockStartIndex + i, c).sessions.find((s) => s.key === 'long')?.run?.km ?? 0);
    expect(Math.max(...longs)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...longs)).toBeLessThanOrEqual(32);
  });
});
