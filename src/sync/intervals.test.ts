import { describe, expect, it } from 'vitest';
import { isDuplicateOf, matchPlanned, toImportedRun, type IntervalsActivity } from './intervals';
import { getWeekPlan } from '../engine/planGenerator';
import { DEFAULT_SETTINGS } from '../plan/settings';

const act = (p: Partial<IntervalsActivity>): IntervalsActivity => ({
  id: '1',
  start_date_local: '2026-11-17T07:12:00',
  type: 'Run',
  distance: 8040,
  moving_time: 2950,
  average_heartrate: 141.6,
  ...p,
});

describe('tolkning av aktiviteter', () => {
  it('löppass blir ett pass med km, tid och puls', () => {
    const r = toImportedRun(act({ average_cadence: 84, trainer: false }))!;
    expect(r).toMatchObject({ externalId: 'intervals:1', date: '2026-11-17', distanceKm: 8.04, durationSec: 2950, avgHr: 142, surface: 'ute', cadence: 168 });
  });
  it('löpband känns igen', () => {
    expect(toImportedRun(act({ trainer: true }))!.surface).toBe('lopband');
    expect(toImportedRun(act({ type: 'VirtualRun' }))!.surface).toBe('lopband');
  });
  it('annat än löpning ignoreras', () => {
    expect(toImportedRun(act({ type: 'WeightTraining' }))).toBeNull();
    expect(toImportedRun(act({ type: 'Ride' }))).toBeNull();
    expect(toImportedRun(act({ distance: 0 }))).toBeNull();
  });
});

describe('koppling till planen', () => {
  const week = getWeekPlan(0, DEFAULT_SETTINGS).sessions; // vecka 1
  it('samma dag → det planerade passet', () => {
    const r = toImportedRun(act({}))!; // tisdag
    expect(matchPlanned(r, week, new Set())!.key).toBe('easy');
  });
  it('flyttat en dag → närmaste ogjorda pass', () => {
    const r = toImportedRun(act({ start_date_local: '2026-11-19T18:00:00', distance: 10000 }))!; // torsdag = kvalitet
    expect(matchPlanned(r, week, new Set())!.key).toBe('quality');
    const r2 = toImportedRun(act({ start_date_local: '2026-11-18T18:00:00', distance: 8000 }))!; // onsdag, tisdagen ej gjord
    expect(matchPlanned(r2, week, new Set())!.key).toBe('easy');
    expect(matchPlanned(r2, week, new Set(['easy']))!.key).toBe('quality');
  });
  it('långpass på lördag i stället för söndag', () => {
    const r = toImportedRun(act({ start_date_local: '2026-11-21T09:00:00', distance: 12100 }))!;
    expect(matchPlanned(r, week, new Set(['easy', 'quality']))!.key).toBe('long');
  });
  it('inget planerat pass i närheten → null', () => {
    const r = toImportedRun(act({ start_date_local: '2026-11-16T09:00:00' }))!; // måndag
    expect(matchPlanned(r, week, new Set(['easy']))).toBeNull();
  });
  it('manuellt loggat samma pass räknas som dubblett', () => {
    const r = toImportedRun(act({}))!;
    expect(isDuplicateOf(r, [{ date: '2026-11-17', distanceKm: 8 }])).toBeTruthy();
    expect(isDuplicateOf(r, [{ date: '2026-11-17', distanceKm: 12 }])).toBeFalsy();
    expect(isDuplicateOf(r, [{ date: '2026-11-17', distanceKm: 8, externalId: 'x' }])).toBeFalsy();
  });
});
