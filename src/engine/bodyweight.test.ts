import { describe, expect, it } from 'vitest';
import { kcalSuggestion, movingAverage, targetKg } from './bodyweight';

describe('kroppsvikt', () => {
  it('målkurvan går genom delmålen', () => {
    expect(targetKg('2026-11-12')).toBe(73.5);
    expect(targetKg('2027-01-24')).toBeCloseTo(76, 5);
    expect(targetKg('2027-03-21')).toBeCloseTo(78, 5);
    expect(targetKg('2027-05-22')).toBeCloseTo(78.5, 5);
    const mid = targetKg('2026-12-18');
    expect(mid).toBeGreaterThan(73.5);
    expect(mid).toBeLessThan(76);
  });
  it('7-dagars glidande medel', () => {
    const w = [
      { date: '2026-11-10', kg: 80 }, // utanför fönstret
      { date: '2026-11-14', kg: 73 },
      { date: '2026-11-16', kg: 74 },
      { date: '2026-11-20', kg: 75 },
    ];
    expect(movingAverage(w, '2026-11-20')).toBe(74);
  });
  it('förslag om +200–250 kcal efter två veckor under kurvan', () => {
    const under = [
      { date: '2026-11-30', kg: 73 },
      { date: '2026-12-02', kg: 73.1 },
      { date: '2026-12-07', kg: 73.2 },
      { date: '2026-12-09', kg: 73.2 },
    ];
    expect(kcalSuggestion(under, '2026-12-15')).toBe(true);
    expect(kcalSuggestion(under.slice(2), '2026-12-15')).toBe(false);
    const onTrack = under.map((x) => ({ ...x, kg: 76 }));
    expect(kcalSuggestion(onTrack, '2026-12-15')).toBe(false);
  });
});
