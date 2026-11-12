/** Hämtar nya löppass från Intervals.icu och sparar dem i appen. */
import { db, uid, type RunRec } from '../db/db';
import { loadSettings, saveSettings } from '../db/store';
import { getWeekPlan, weekIndexForDate } from '../engine/planGenerator';
import { addDays, today } from '../lib/dates';
import { PLAN_START } from '../plan/config';
import { fetchActivities, guessCategory, isDuplicateOf, matchPlanned, toImportedRun, SyncError } from './intervals';

export interface SyncResult {
  imported: number;
  linked: number;
  message: string;
  error?: boolean;
}

let running: Promise<SyncResult> | null = null;
const MIN_INTERVAL_MS = 10 * 60 * 1000;

export function syncIntervals(force = false): Promise<SyncResult> {
  if (running) return running;
  running = doSync(force).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(force: boolean): Promise<SyncResult> {
  const s = await loadSettings();
  if (!s.intervalsApiKey.trim()) return { imported: 0, linked: 0, message: 'Ingen API-nyckel' };
  if (!force && s.lastSyncAt && Date.now() - new Date(s.lastSyncAt).getTime() < MIN_INTERVAL_MS) {
    return { imported: 0, linked: 0, message: s.lastSyncMessage ?? '' };
  }
  const day = today();
  // Hämta från senaste synk minus 3 dagar (fångar sena uppladdningar), första gången från planstart − 14 dagar.
  const oldest = s.lastSyncAt ? addDays(s.lastSyncAt.slice(0, 10), -3) : addDays(PLAN_START, -14);
  let acts;
  try {
    acts = await fetchActivities({ apiKey: s.intervalsApiKey, athleteId: s.intervalsAthleteId, proxyUrl: s.intervalsProxyUrl }, oldest, addDays(day, 1));
  } catch (e) {
    const msg = e instanceof SyncError ? e.message : 'Synken misslyckades.';
    await saveSettings({ lastSyncMessage: msg, lastSyncError: true });
    return { imported: 0, linked: 0, message: msg, error: true };
  }

  let imported = 0;
  let linked = 0;
  const runs = acts.map(toImportedRun).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => a.date.localeCompare(b.date));

  for (const r of runs) {
    if (await db.runs.where('externalId').equals(r.externalId).first()) continue;
    const weekIndex = weekIndexForDate(r.date);
    const existing = await db.runs.where('weekIndex').equals(weekIndex).toArray();

    // Redan loggat för hand → koppla ihop och fyll på med klockans data.
    const dup = isDuplicateOf(r, existing);
    if (dup) {
      await db.runs.update((dup as RunRec).id, {
        externalId: r.externalId,
        distanceKm: r.distanceKm,
        durationSec: r.durationSec,
        avgHr: r.avgHr ?? (dup as RunRec).avgHr,
        maxHr: r.maxHr,
        elevationGainM: r.elevationGainM,
        cadence: r.cadence,
        activityType: r.activityType,
      });
      linked++;
      continue;
    }

    const plan = getWeekPlan(weekIndex, s);
    const taken = new Set(existing.map((e) => e.plannedKey).filter((k): k is string => !!k));
    const m = matchPlanned(r, plan.sessions, taken);
    const isTest = m?.run?.category === 'test';
    const rec: RunRec = {
      id: uid(),
      date: r.date,
      weekIndex,
      plannedKey: m?.key ?? null,
      category: m?.run?.category ?? guessCategory(r),
      distanceKm: r.distanceKm,
      durationSec: r.durationSec,
      avgHr: r.avgHr,
      maxHr: r.maxHr,
      rpe: r.rpe,
      surface: r.surface,
      notes: '',
      test: isTest ? m!.run!.test : m?.run?.category === 'lopp' ? 'race' : undefined,
      needsTestTime: isTest || undefined,
      plannedWorkKm: m?.run?.workKm,
      plannedKm: m?.run?.km,
      source: 'intervals',
      externalId: r.externalId,
      activityType: r.activityType,
      elevationGainM: r.elevationGainM,
      cadence: r.cadence,
      name: r.name,
      createdAt: Date.now(),
    };
    await db.runs.put(rec);
    imported++;
  }

  const message =
    imported || linked
      ? `${imported ? `${imported} nya pass` : ''}${imported && linked ? ', ' : ''}${linked ? `${linked} kopplade till handloggade` : ''}`
      : 'Inga nya pass';
  await saveSettings({ lastSyncAt: new Date().toISOString(), lastSyncMessage: message, lastSyncError: false });
  return { imported, linked, message };
}
