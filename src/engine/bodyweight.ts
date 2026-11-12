import { BODY } from '../plan/config';
import { addDays, diffDays, mondayOf } from '../lib/dates';

export interface Weigh {
  date: string;
  kg: number;
}

/** Målkurva: rak linje mellan delmålen. */
export function targetKg(date: string): number {
  const m = BODY.milestones;
  if (date <= m[0].date) return m[0].kg;
  for (let i = 1; i < m.length; i++) {
    if (date <= m[i].date) {
      const a = m[i - 1];
      const b = m[i];
      const f = diffDays(date, a.date) / diffDays(b.date, a.date);
      return a.kg + (b.kg - a.kg) * f;
    }
  }
  return m[m.length - 1].kg;
}

/** 7-dagars glidande medel (dagarna date−6 … date). */
export function movingAverage(weighs: Weigh[], date: string, days = 7): number | null {
  const from = addDays(date, -(days - 1));
  const w = weighs.filter((x) => x.date >= from && x.date <= date);
  if (!w.length) return null;
  return w.reduce((a, x) => a + x.kg, 0) / w.length;
}

export interface WeekAvg {
  monday: string;
  avg: number;
  target: number;
  count: number;
}

export function weeklyAverages(weighs: Weigh[]): WeekAvg[] {
  const map = new Map<string, Weigh[]>();
  for (const w of weighs) {
    const k = mondayOf(w.date);
    map.set(k, [...(map.get(k) ?? []), w]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, list]) => ({
      monday,
      avg: list.reduce((a, x) => a + x.kg, 0) / list.length,
      target: targetKg(addDays(monday, 3)),
      count: list.length,
    }));
}

/**
 * Ligger veckomedlet under målkurvan två hela veckor i rad → föreslå mer mat.
 * Bara avslutade veckor (före innevarande vecka) räknas.
 */
export function kcalSuggestion(weighs: Weigh[], today: string): boolean {
  const done = weeklyAverages(weighs).filter((w) => w.monday < mondayOf(today));
  const last = done.slice(-BODY.weeksBelowForSuggestion);
  if (last.length < BODY.weeksBelowForSuggestion) return false;
  // Veckorna måste vara i följd.
  for (let i = 1; i < last.length; i++) if (diffDays(last[i].monday, last[i - 1].monday) !== 7) return false;
  if (diffDays(mondayOf(today), last[last.length - 1].monday) !== 7) return false;
  return last.every((w) => w.avg < w.target);
}
