import { describe, expect, it } from 'vitest';
import { runGuide } from './runGuide';
import { getWeekPlan } from './planGenerator';
import { DEFAULT_SETTINGS } from '../plan/settings';

const run = (week: number, key: string) => getWeekPlan(week - 1, DEFAULT_SETTINGS).sessions.find((s) => s.key === key)!.run!;

describe('Så gör du', () => {
  it('lugnt pass + stegringslopp', () => {
    const g = runGuide(run(1, 'easy'), DEFAULT_SETTINGS);
    expect(g.steps.map((s) => s.title)).toEqual([expect.stringMatching(/km lugnt$/), 'Direkt efter: 6 × 20 s stegringslopp']);
    expect(g.terms).toContain('stegringslopp');
    expect(g.zones).toEqual(['lugn']);
  });
  it('intervaller: uppvärmning, block, vila, nedjogg', () => {
    const g = runGuide(run(1, 'quality'), DEFAULT_SETTINGS);
    expect(g.steps.map((s) => s.title)).toEqual(['Uppvärmning 2 km lugnt', '5 × 4 min i VO2-fart', 'Mellan varje: 2 min lugn jogg', 'Nedjogg 2 km lugnt']);
    expect(g.steps[1].detail).toContain('4:10–4:15/km');
  });
  it('1000 m med stående vila', () => {
    const g = runGuide(run(6, 'quality'), DEFAULT_SETTINGS);
    expect(g.steps[1].title).toBe('5 × 1000 m i VO2-fart');
    expect(g.steps[2].title).toBe('Mellan varje: 2 min vila');
  });
  it('långpass med sista km i annan fart', () => {
    const g = runGuide(run(15, 'long'), DEFAULT_SETTINGS);
    expect(g.steps.map((s) => s.title)).toEqual(['Först 16 km lugnt', 'Sista 4 km i steady-fart']);
  });
  it('testlopp', () => {
    const g = runGuide(run(8, 'quality'), DEFAULT_SETTINGS);
    expect(g.steps[1].title).toBe('5 km i testfart');
    expect(g.terms).toContain('test');
  });
  it('tävlingsveckan', () => {
    const g = runGuide(run(27, 'tune'), DEFAULT_SETTINGS);
    expect(g.steps[1].title).toBe('3 × 1 km halvmarafart');
    expect(g.steps[2].title).toBe('Resten lugnt');
  });
});
