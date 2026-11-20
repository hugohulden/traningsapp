/**
 * Kaloriräknarens rena logik: mål, makron, mängder, rätter och sökrankning.
 * Testad i engine.test.ts.
 */
import type { Amount, Meal, Nutrients, RecipeRec } from '../db/db';
import { FOOD } from '../plan/config';

export const MEALS: Meal[] = ['frukost', 'lunch', 'middag', 'mellanmal'];
export const MEAL_NAMES: Record<Meal, string> = { frukost: 'Frukost', lunch: 'Lunch', middag: 'Middag', mellanmal: 'Mellanmål' };

/** Dagens kalorimål: Garmin-förbrukningen om den är ifylld, annars underhåll, plus överskottet. */
export function dayTarget(s: { maintenanceKcal: number; surplusKcal: number }, burnedKcal?: number | null): number {
  const base = burnedKcal && burnedKcal > 0 ? burnedKcal : s.maintenanceKcal;
  return Math.round(base + s.surplusKcal);
}

/** Makromål i gram (protein och kolhydrater 4 kcal/g, fett 9 kcal/g). */
export function macroTargets(kcal: number, pct: { p: number; c: number; f: number }) {
  return {
    p: Math.round((kcal * pct.p) / 100 / 4),
    c: Math.round((kcal * pct.c) / 100 / 4),
    f: Math.round((kcal * pct.f) / 100 / 9),
  };
}

export function sumNutrients(list: Nutrients[]): Required<Nutrients> {
  return list.reduce<Required<Nutrients>>(
    (a, n) => ({ kcal: a.kcal + (n.kcal || 0), p: a.p + (n.p || 0), c: a.c + (n.c || 0), f: a.f + (n.f || 0) }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

/** Näringsvärden för ett antal gram av ett livsmedel (per100 = per 100 g). */
export function forGrams(per100: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  const r = (v?: number) => (v == null ? undefined : Math.round(v * k * 10) / 10);
  return { kcal: Math.round(per100.kcal * k), p: r(per100.p), c: r(per100.c), f: r(per100.f) };
}

/** Gram för en mängd. Portioner kräver portionsvikt. */
export function amountToGrams(a: Amount, servingG?: number): number | null {
  if (a.unit === 'g') return a.value;
  return servingG ? a.value * servingG : null;
}

// ---------------------------------------------------------------------------
// Rätter
// ---------------------------------------------------------------------------

export function recipeTotal(r: Pick<RecipeRec, 'ingredients'>): Required<Nutrients> & { grams: number } {
  const t = sumNutrients(r.ingredients.map((i) => forGrams(i.per100, i.grams)));
  return { ...t, grams: r.ingredients.reduce((a, i) => a + i.grams, 0) };
}

/** Per portion. */
export function recipePerPortion(r: Pick<RecipeRec, 'ingredients' | 'portions'>): Nutrients {
  const t = recipeTotal(r);
  const n = Math.max(1, r.portions || 1);
  const d = (v: number) => Math.round((v / n) * 10) / 10;
  return { kcal: Math.round(t.kcal / n), p: d(t.p), c: d(t.c), f: d(t.f) };
}

/** Portionsvikt i gram: färdig vikt / portioner om den är angiven, annars summan av ingredienserna / portioner. */
export function recipeServingG(r: Pick<RecipeRec, 'ingredients' | 'portions' | 'totalWeightG'>): number {
  const total = r.totalWeightG && r.totalWeightG > 0 ? r.totalWeightG : recipeTotal(r).grams;
  return Math.round(total / Math.max(1, r.portions || 1));
}

/** Näringsvärden för en mängd av en rätt. */
export function recipeFor(r: Pick<RecipeRec, 'ingredients' | 'portions' | 'totalWeightG'>, a: Amount): Nutrients {
  const per = recipePerPortion(r);
  const portions = a.unit === 'portion' ? a.value : a.value / recipeServingG(r);
  const m = (v?: number) => (v == null ? undefined : Math.round(v * portions * 10) / 10);
  return { kcal: Math.round(per.kcal * portions), p: m(per.p), c: m(per.c), f: m(per.f) };
}

// ---------------------------------------------------------------------------
// Måltid efter klockslag
// ---------------------------------------------------------------------------

/** Förvald måltid: frukost före 10:30, lunch 10:30–14:30, mellanmål 14:30–17, middag 17–21, sedan mellanmål. */
export function mealForTime(d: Date): Meal {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 4 * 60 && m < 10 * 60 + 30) return 'frukost';
  if (m >= 10 * 60 + 30 && m < 14 * 60 + 30) return 'lunch';
  if (m >= 17 * 60 && m < 21 * 60) return 'middag';
  return 'mellanmal';
}

// ---------------------------------------------------------------------------
// Sök
// ---------------------------------------------------------------------------

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,.()/%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Poäng för hur väl en text matchar sökningen (0 = ingen träff). Alla ord måste finnas.
 * Början av namnet > början av ett ord > var som helst. Kortare namn vinner vid lika.
 */
export function matchScore(name: string, query: string): number {
  const n = normalize(name);
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return 0;
  let score = 0;
  for (const w of words) {
    const i = n.indexOf(w);
    if (i < 0) return 0;
    score += i === 0 ? 30 : n[i - 1] === ' ' ? 20 : 8;
  }
  return score + Math.max(0, 20 - n.length / 3);
}

export interface Searchable {
  name: string;
}

/** Sorterar och filtrerar på matchning. */
export function rank<T extends Searchable>(items: T[], query: string, limit = 30): T[] {
  return items
    .map((it) => ({ it, s: matchScore(it.name, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);
}

/** Livsmedelsverkets komprimerade rad: [nummer, namn, kcal, protein, kolhydrater, fett] per 100 g. */
export type LvRow = [number, string, number, number, number, number];

export function lvToFood(r: LvRow): { id: string; source: 'lv'; name: string; per100: Nutrients; servingG?: number; unitLabel?: string } {
  return withUnit({ id: `lv:${r[0]}`, source: 'lv' as const, name: r[1], per100: { kcal: r[2], p: r[3], c: r[4], f: r[5] } });
}

// ---------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_sv?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

/** Gör om en Open Food Facts-produkt till ett livsmedel. Null om kcal saknas. */
export function offToFood(p: OffProduct, barcode?: string) {
  const n = p.nutriments ?? {};
  const num = (k: string) => {
    const v = n[k];
    const x = typeof v === 'string' ? parseFloat(v) : v;
    return x != null && isFinite(x) ? x : undefined;
  };
  let kcal = num('energy-kcal_100g');
  if (kcal == null) {
    const kj = num('energy-kj_100g') ?? num('energy_100g');
    if (kj != null) kcal = kj / 4.184;
  }
  const name = (p.product_name_sv || p.product_name || '').trim();
  if (kcal == null || !name) return null;
  const sq = typeof p.serving_quantity === 'string' ? parseFloat(p.serving_quantity) : p.serving_quantity;
  const code = barcode ?? p.code;
  const r1 = (v?: number) => (v == null ? undefined : Math.round(v * 10) / 10);
  return {
    id: `off:${code}`,
    source: 'off' as const,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    barcode: code,
    per100: { kcal: Math.round(kcal), p: r1(num('proteins_100g')), c: r1(num('carbohydrates_100g')), f: r1(num('fat_100g')) },
    servingG: sq && sq > 0 ? Math.round(sq) : undefined,
    servingLabel: p.serving_size || undefined,
  };
}

// ---------------------------------------------------------------------------
// Styckvikter (t.ex. 1 st ägg ≈ 50 g)
// ---------------------------------------------------------------------------


const PLURAL: Record<string, string> = { st: 'st', skiva: 'skivor', glas: 'glas', dl: 'dl', klyfta: 'klyftor', filé: 'filéer', bit: 'bitar', klick: 'klickar', portion: 'portioner', låda: 'lådor' };

/** "1 st", "2 skivor", "1,5 portioner" */
export function unitText(n: number, unit = 'portion'): string {
  const v = String(Math.round(n * 100) / 100).replace('.', ',');
  return `${v} ${n === 1 ? unit : PLURAL[unit] ?? unit}`;
}

/** Ungefärlig styckvikt för ett livsmedel från Livsmedelsverket, om det finns en regel. */
export function unitFor(name: string): { unit: string; g: number } | null {
  const words = normalize(name).split(' ');
  for (const r of FOOD.units) {
    if (words[0] !== r.first) continue;
    if (r.has && !words.includes(r.has)) continue;
    if (r.not?.some((x) => words.some((w) => w.startsWith(x)))) continue;
    return { unit: r.unit, g: r.g };
  }
  return null;
}

/** Lägger till styckvikt på Livsmedelsverkets livsmedel som saknar portion. */
export function withUnit<T extends { source: string; name: string; servingG?: number; unitLabel?: string }>(f: T): T {
  if (f.source !== 'lv' || f.servingG) return f;
  const u = unitFor(f.name);
  return u ? { ...f, servingG: u.g, unitLabel: u.unit } : f;
}
