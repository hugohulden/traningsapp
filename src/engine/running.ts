import { EASY_PACE_TEXT, HM_PREDICT, THRESHOLD_FROM_TEST, ZONES } from '../plan/config';
import type { Amount, IntervalBlock, QualityDef, ZoneKey } from '../plan/types';
import type { AppSettings } from '../plan/settings';
import { formatPace } from '../lib/format';

type PaceSettings = Pick<AppSettings, 'thresholdSec' | 'hmGoalSec' | 'hmDreamSec' | 'easyEstimateSec' | 'tempoOffsetSec'>;

/** Fart (s/km) som används för att räkna om tid till km. */
export function estimatePace(zone: ZoneKey | 'test', s: PaceSettings): number {
  const T = s.thresholdSec;
  switch (zone) {
    case 'lugn':
      return s.easyEstimateSec;
    case 'hm':
      return s.hmGoalSec;
    case 'tempo':
      return T + s.tempoOffsetSec;
    case 'test':
      return T - 15;
    default: {
      const z = ZONES.find((x) => x.key === zone);
      return T + (z?.estimateOffset ?? 0);
    }
  }
}

export function amountKm(a: Amount, paceSec: number): number {
  return 'km' in a ? a.km : (a.min * 60) / paceSec;
}

export function blockWorkKm(b: IntervalBlock, s: PaceSettings): number {
  return b.reps * amountKm(b.work, estimatePace(b.zone, s));
}

export function blockRestKm(b: IntervalBlock, s: PaceSettings): number {
  if (!b.rest || b.restKind === 'vila' || b.reps < 2) return 0;
  return (b.reps - 1) * amountKm(b.rest, s.easyEstimateSec);
}

export interface QualityKm {
  total: number;
  work: number;
}

export function qualityKm(q: QualityDef, s: PaceSettings, warmup = 2, cooldown = 2): QualityKm {
  let work = 0;
  let rest = 0;
  for (const b of q.blocks) {
    work += blockWorkKm(b, s);
    rest += blockRestKm(b, s);
  }
  const total = (q.warmupKm ?? warmup) + (q.cooldownKm ?? cooldown) + work + rest;
  return { total: round1(total), work: round1(work) };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round05 = (n: number) => Math.round(n * 2) / 2;

/** Fartintervall som text för en zon. */
export function zoneText(zone: ZoneKey, s: PaceSettings): string {
  const z = ZONES.find((x) => x.key === zone)!;
  if (zone === 'lugn') return EASY_PACE_TEXT;
  if (zone === 'hm') return `${formatPace(s.hmGoalSec)}/km (drömmål ${formatPace(s.hmDreamSec)})`;
  if (!z.offset) return '';
  const [a, b] = z.offset;
  const fast = s.thresholdSec + a;
  const slow = s.thresholdSec + b;
  return fast === slow ? `${formatPace(fast)}/km` : `${formatPace(fast)}–${formatPace(slow)}/km`;
}

export function zoneHr(zone: ZoneKey): string {
  return ZONES.find((x) => x.key === zone)!.hr;
}

export function zoneName(zone: ZoneKey): string {
  return ZONES.find((x) => x.key === zone)!.name;
}

/** Ny tröskelfart från testlopp. */
export function thresholdFromTest(test: '5k' | '10k', timeSec: number): number {
  const km = test === '5k' ? 5 : 10;
  return Math.round(timeSec / km + THRESHOLD_FROM_TEST[test]);
}

/** Halvmaraprognos i sekunder. */
export function hmPrediction(test: '5k' | '10k', timeSec: number): number {
  return timeSec * HM_PREDICT[test];
}

export function paceOf(distanceKm: number, durationSec: number): number | null {
  if (!distanceKm || !durationSec) return null;
  return durationSec / distanceKm;
}

/** Uppskattad tid för ett planerat pass (för förifyllning). */
export function plannedDurationSec(
  r: { category: string; km: number; blocks?: IntervalBlock[]; long?: { km: number; segments?: { km: number; reps?: number; zone: ZoneKey }[] } },
  s: PaceSettings,
): number {
  if (r.category === 'lopp') return r.km * s.hmGoalSec;
  if (r.blocks && r.blocks.length) {
    let km = 0;
    let sec = 0;
    for (const b of r.blocks) {
      const pace = estimatePace(b.zone, s);
      const w = blockWorkKm(b, s);
      km += w;
      sec += w * pace;
      if (b.rest && b.reps > 1) {
        const restKm = blockRestKm(b, s);
        km += restKm;
        sec += 'min' in b.rest ? (b.reps - 1) * b.rest.min * 60 : restKm * s.easyEstimateSec;
      }
    }
    return Math.round(sec + Math.max(0, r.km - km) * s.easyEstimateSec);
  }
  if (r.long?.segments?.length) {
    let segKm = 0;
    let sec = 0;
    for (const g of r.long.segments) {
      const k = g.km * (g.reps ?? 1);
      segKm += k;
      sec += k * estimatePace(g.zone, s);
    }
    return Math.round(sec + (r.km - segKm) * s.easyEstimateSec);
  }
  return Math.round(r.km * s.easyEstimateSec);
}
