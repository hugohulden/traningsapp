/**
 * Automatisk import av löppass från Intervals.icu (som i sin tur synkar från Garmin Connect).
 * Den rena logiken (tolkning och matchning mot planen) är testad i intervals.test.ts.
 */
import type { PlannedSession, RunCategory } from '../engine/planGenerator';

export interface IntervalsActivity {
  id: string;
  start_date_local: string; // "2026-11-17T07:12:00"
  type?: string; // "Run", "VirtualRun", "TrailRun", …
  name?: string;
  distance?: number; // meter
  moving_time?: number; // sekunder
  elapsed_time?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  average_cadence?: number;
  trainer?: boolean;
  icu_rpe?: number;
  perceived_exertion?: number;
  source?: string;
}

export interface ImportedRun {
  externalId: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  avgHr?: number;
  maxHr?: number;
  rpe?: number;
  surface: 'ute' | 'lopband';
  elevationGainM?: number;
  cadence?: number;
  activityType: string;
  name: string;
}

const RUN_TYPES = ['Run', 'VirtualRun', 'TrailRun', 'TreadmillRun'];

export function isRun(a: IntervalsActivity): boolean {
  return !!a.type && (RUN_TYPES.includes(a.type) || /run/i.test(a.type));
}

export function toImportedRun(a: IntervalsActivity): ImportedRun | null {
  if (!isRun(a) || !a.distance || a.distance < 200) return null;
  const durationSec = a.moving_time || a.elapsed_time || 0;
  if (!durationSec) return null;
  const rpe = a.icu_rpe ?? a.perceived_exertion;
  // Garmin ger löpkadens per fot ibland (t.ex. 85) – dubbla till steg/min.
  const cad = a.average_cadence ? (a.average_cadence < 120 ? a.average_cadence * 2 : a.average_cadence) : undefined;
  return {
    externalId: `intervals:${a.id}`,
    date: a.start_date_local.slice(0, 10),
    distanceKm: Math.round((a.distance / 1000) * 100) / 100,
    durationSec: Math.round(durationSec),
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
    rpe: rpe && rpe >= 1 && rpe <= 10 ? Math.round(rpe) : undefined,
    surface: a.trainer || a.type === 'VirtualRun' || a.type === 'TreadmillRun' ? 'lopband' : 'ute',
    elevationGainM: a.total_elevation_gain,
    cadence: cad ? Math.round(cad) : undefined,
    activityType: a.type ?? 'Run',
    name: a.name ?? '',
  };
}

export interface ImportedSwim {
  externalId: string;
  date: string;
  distanceM: number;
  durationSec: number;
  avgHr?: number;
  maxHr?: number;
  rpe?: number;
  pool: 'bassang' | 'oppet';
  name: string;
}

export function isSwim(a: IntervalsActivity): boolean {
  return !!a.type && /swim/i.test(a.type);
}

export function toImportedSwim(a: IntervalsActivity): ImportedSwim | null {
  if (!isSwim(a) || !a.distance) return null;
  const durationSec = a.moving_time || a.elapsed_time || 0;
  if (!durationSec) return null;
  const rpe = a.icu_rpe ?? a.perceived_exertion;
  return {
    externalId: `intervals:${a.id}`,
    date: a.start_date_local.slice(0, 10),
    distanceM: Math.round(a.distance),
    durationSec: Math.round(durationSec),
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
    rpe: rpe && rpe >= 1 && rpe <= 10 ? Math.round(rpe) : undefined,
    pool: /open/i.test(a.type ?? '') ? 'oppet' : 'bassang',
    name: a.name ?? '',
  };
}

function dayDiff(a: string, b: string): number {
  const p = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((p(a) - p(b)) / 86400000);
}

/**
 * Koppla ett importerat pass till ett planerat löppass i samma vecka.
 * Samma dag först; annars det närmaste ogjorda passet inom ±2 dagar
 * (pass flyttas ofta en dag). Lördagens valfria pass väljs bara på samma dag.
 */
export function matchPlanned(run: ImportedRun, weekSessions: PlannedSession[], takenKeys: Set<string>): PlannedSession | null {
  const cands = weekSessions.filter((s) => s.kind === 'run' && !takenKeys.has(s.key));
  const same = cands.filter((s) => s.date === run.date);
  if (same.length) {
    // Flera pass samma dag: välj det med närmast distans.
    return same.sort((a, b) => Math.abs(a.run!.km - run.distanceKm) - Math.abs(b.run!.km - run.distanceKm))[0];
  }
  const near = cands
    .filter((s) => !s.optional && Math.abs(dayDiff(s.date, run.date)) <= 2)
    .sort((a, b) => Math.abs(dayDiff(a.date, run.date)) - Math.abs(dayDiff(b.date, run.date)) || Math.abs(a.run!.km - run.distanceKm) - Math.abs(b.run!.km - run.distanceKm));
  return near[0] ?? null;
}

/** Kategori när passet inte matchar något planerat pass. */
export function guessCategory(run: ImportedRun): RunCategory {
  return run.distanceKm >= 15 ? 'lang' : 'lugn';
}

/** Samma pass redan loggat för hand eller inläst från Garmin-historik (samma dag, distans inom 10 %)? */
export function isDuplicateOf(run: ImportedRun, existing: { date: string; distanceKm: number; externalId?: string }[]) {
  return existing.find((e) => !e.externalId?.startsWith('intervals:') && e.date === run.date && Math.abs(e.distanceKm - run.distanceKm) <= Math.max(0.3, run.distanceKm * 0.1));
}

// ---------------------------------------------------------------------------
// Nätverk
// ---------------------------------------------------------------------------

export interface IntervalsConfig {
  apiKey: string;
  athleteId: string; // "0" = kontot som äger nyckeln
  proxyUrl: string; // tom = direkt mot intervals.icu
}

export class SyncError extends Error {
  constructor(
    message: string,
    public kind: 'auth' | 'network' | 'other',
  ) {
    super(message);
  }
}

export async function fetchActivities(cfg: IntervalsConfig, oldest: string, newest: string): Promise<IntervalsActivity[]> {
  const base = (cfg.proxyUrl.trim() || 'https://intervals.icu').replace(/\/$/, '');
  const id = cfg.athleteId.trim() || '0';
  const url = `${base}/api/v1/athlete/${encodeURIComponent(id)}/activities?oldest=${oldest}&newest=${newest}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Basic ${btoa(`API_KEY:${cfg.apiKey.trim()}`)}` } });
  } catch {
    throw new SyncError('Kunde inte nå Intervals.icu. Saknas nät, eller blockerar webbläsaren anropet? Då behövs mellanservern (se README).', 'network');
  }
  if (res.status === 401 || res.status === 403) throw new SyncError('Intervals.icu nekade åtkomst. Kontrollera API-nyckel och atlet-id.', 'auth');
  if (!res.ok) throw new SyncError(`Intervals.icu svarade ${res.status}.`, 'other');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
