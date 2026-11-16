import { useLiveQuery } from 'dexie-react-hooks';
import { db, type GymSessionRec, type RunRec, type SwimRec } from '../db/db';
import type { AppSettings } from '../plan/settings';
import { getWeekPlan, type PlannedSession, type WeekPlan } from '../engine/planGenerator';
import { today } from '../lib/dates';
import { useEffect, useState } from 'react';

export function useToday(): string {
  const [d, setD] = useState(today());
  useEffect(() => {
    const t = setInterval(() => setD(today()), 60_000);
    const vis = () => setD(today());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return d;
}

export function weekPlan(index: number, s: AppSettings): WeekPlan {
  return getWeekPlan(index, s);
}

export interface WeekLogs {
  gym: GymSessionRec[];
  runs: RunRec[];
  swims?: SwimRec[];
}

export function useWeekLogs(index: number): WeekLogs | undefined {
  return useLiveQuery(async () => {
    const gym = (await db.gymSessions.where('weekIndex').equals(index).toArray()).filter((g) => g.status === 'done');
    const runs = await db.runs.where('weekIndex').equals(index).toArray();
    const swims = await db.swims.where('weekIndex').equals(index).toArray();
    return { gym, runs, swims };
  }, [index]);
}

export function isDone(s: PlannedSession, logs: WeekLogs | undefined): boolean {
  if (!logs) return false;
  if (s.kind === 'gym') return logs.gym.some((g) => g.plannedKey === s.key);
  return logs.runs.some((r) => r.plannedKey === s.key);
}

export function weekStatus(w: WeekPlan, logs: WeekLogs | undefined) {
  const required = w.sessions.filter((s) => !s.optional);
  const done = required.filter((s) => isDone(s, logs)).length;
  const kmDone = (logs?.runs ?? []).reduce((a, r) => a + r.distanceKm, 0);
  return { done, total: required.length, kmDone };
}

/** Andel lugn löpning av tiden (≈, kvalitetspassens arbetsdel räknas som hård). */
export function easyShare(runs: RunRec[]): number | null {
  let easy = 0;
  let total = 0;
  for (const r of runs) {
    if (!r.durationSec) continue;
    total += r.durationSec;
    if (r.category === 'lugn' || r.category === 'extra') easy += r.durationSec;
    else {
      const workKm = Math.min(r.distanceKm, r.plannedWorkKm ?? (r.category === 'lang' ? 0 : r.distanceKm * 0.5));
      const pace = r.durationSec / r.distanceKm;
      easy += Math.max(0, r.durationSec - workKm * pace * 0.9);
    }
  }
  return total > 0 ? easy / total : null;
}
