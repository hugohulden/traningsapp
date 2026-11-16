import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDB } from './db';
import { exportAll, importAll } from './backup';

describe('export/import', () => {
  it('bevarar all data', async () => {
    const a = new AppDB('test-a');
    await a.gymSessions.put({
      id: 'g1', date: '2026-11-16', weekIndex: 0, plannedKey: 'gymA', template: 'A', title: 'Gym A', deload: false, variant: 'normal',
      status: 'done', startedAt: 1, finishedAt: 2, notes: 'bra',
      exercises: [{ slotId: 'A1', exerciseId: 'knaboj', prescription: { sets: 3, repMin: 4, repMax: 6, rir: [2, 2] }, mode: 'normal',
        target: { kind: 'start', sets: [], rir: [2, 2], reason: '' }, sets: [{ weight: 47.5, reps: 6, rir: 2, done: true }], warmups: [], notes: '', optional: false }],
    });
    await a.runs.put({ id: 'r1', date: '2026-11-17', weekIndex: 0, plannedKey: 'easy', category: 'lugn', distanceKm: 8, durationSec: 2950, avgHr: 142, rpe: 3, surface: 'ute', notes: '', source: 'manuell', createdAt: 1 });
    await a.weighIns.put({ date: '2026-11-16', kg: 73.6 });
    await a.protein.put({ date: '2026-11-16', done: true });
    await a.thresholds.put({ date: '2026-11-16', thresholdSec: 275, source: 'start' });
    await a.customExercises.put({ id: 'egen-1', name: 'Egen', muscleGroup: 'Rygg', kind: 'maskin', step: { type: 'maskin' }, compound: false, alternatives: [], custom: true });
    await a.kv.put({ key: 'settings', value: { thresholdSec: 270 } });

    const file = JSON.parse(JSON.stringify(await exportAll(a)));
    const b = new AppDB('test-b');
    await b.runs.put({ id: 'gammal', date: '2020-01-01', weekIndex: -1, plannedKey: null, category: 'lugn', distanceKm: 1, durationSec: 1, surface: 'ute', notes: '', source: 'manuell', createdAt: 0 });
    await importAll(b, file);

    const again = JSON.parse(JSON.stringify(await exportAll(b)));
    expect(again.data).toEqual(file.data);
    expect(await b.runs.get('gammal')).toBeUndefined();
  });

  it('avvisar fel fil', async () => {
    await expect(importAll(new AppDB('test-c'), { hej: 1 })).rejects.toThrow();
  });
});

describe('historikimport', () => {
  it('lägger till utan att radera och kan köras två gånger', async () => {
    const { mergeHistory } = await import('./backup');
    const d = new AppDB('test-h');
    await d.runs.put({ id: 'egen', date: '2026-11-17', weekIndex: 0, plannedKey: 'easy', category: 'lugn', distanceKm: 8, durationSec: 2900, surface: 'ute', notes: '', source: 'manuell', createdAt: 1 });
    const file = {
      format: 'traningsapp-historik',
      version: 1,
      data: {
        runs: [{ id: 'garmin-1', date: '2026-11-03', weekIndex: -2, plannedKey: null, category: 'lugn', distanceKm: 8.2, durationSec: 3280, surface: 'ute', notes: '', source: 'garmin', externalId: 'garmin:1', createdAt: 2 }],
        gymSessions: [],
        swims: [{ id: 'garmin-2', date: '2026-11-14', weekIndex: -1, distanceM: 800, durationSec: 1545, pool: 'bassang', notes: '', source: 'garmin', createdAt: 3 }],
      },
    };
    expect(await mergeHistory(d, file)).toEqual({ runs: 1, gym: 0, swims: 1 });
    expect(await mergeHistory(d, file)).toEqual({ runs: 0, gym: 0, swims: 0 });
    expect(await d.swims.count()).toBe(1);
    expect(await d.runs.count()).toBe(2);
  });
});
