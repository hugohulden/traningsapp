import { describe, expect, it } from 'vitest';
import {
  dayTarget,
  forGrams,
  macroTargets,
  mealForTime,
  offToFood,
  rank,
  recipeFor,
  recipePerPortion,
  recipeServingG,
  sumNutrients,
} from './engine';

describe('kalorimål', () => {
  it('underhåll + överskott', () => expect(dayTarget({ maintenanceKcal: 3100, surplusKcal: 400 })).toBe(3500));
  it('dagens Garmin-förbrukning ersätter underhåll', () => expect(dayTarget({ maintenanceKcal: 3100, surplusKcal: 400 }, 3420)).toBe(3820));
  it('tomt fält → standardmålet', () => expect(dayTarget({ maintenanceKcal: 3100, surplusKcal: 400 }, null)).toBe(3500));
  it('makron 25/50/25 av 3500', () => expect(macroTargets(3500, { p: 25, c: 50, f: 25 })).toEqual({ p: 219, c: 438, f: 97 }));
});

describe('mängder', () => {
  it('gram räknas från per 100 g', () => expect(forGrams({ kcal: 136, p: 12.1, c: 0, f: 9.8 }, 120)).toEqual({ kcal: 163, p: 14.5, c: 0, f: 11.8 }));
  it('summering', () => expect(sumNutrients([{ kcal: 100, p: 5 }, { kcal: 50, f: 2 }])).toEqual({ kcal: 150, p: 5, c: 0, f: 2 }));
});

describe('rätter', () => {
  const gryta = {
    ingredients: [
      { name: 'Kyckling', grams: 800, per100: { kcal: 116, p: 23, c: 0, f: 2.5 } },
      { name: 'Ris okokt', grams: 400, per100: { kcal: 359, p: 9.2, c: 76.7, f: 1 } },
      { name: 'Grädde', grams: 200, per100: { kcal: 340, p: 2, c: 3, f: 36 } },
    ],
    portions: 4,
  };
  it('per portion', () => {
    // 928 + 1436 + 680 = 3044 kcal → 761 per portion
    expect(recipePerPortion(gryta)).toEqual({ kcal: 761, p: 56.2, c: 78.2, f: 24 });
  });
  it('portionsvikt utan färdig vikt = summan av ingredienserna', () => expect(recipeServingG(gryta)).toBe(350));
  it('portionsvikt med färdig vikt', () => expect(recipeServingG({ ...gryta, totalWeightG: 2000 })).toBe(500));
  it('logga i gram när färdig vikt finns', () => expect(recipeFor({ ...gryta, totalWeightG: 2000 }, { unit: 'g', value: 250 }).kcal).toBe(381));
  it('logga 1,5 portion', () => expect(recipeFor(gryta, { unit: 'portion', value: 1.5 }).kcal).toBe(1142));
});

describe('måltid efter klockslag', () => {
  const at = (h: number, m = 0) => mealForTime(new Date(2026, 10, 20, h, m));
  it('frukost', () => expect(at(7)).toBe('frukost'));
  it('lunch', () => expect(at(12)).toBe('lunch'));
  it('mellanmål på eftermiddagen', () => expect(at(15, 30)).toBe('mellanmal'));
  it('middag', () => expect(at(18)).toBe('middag'));
  it('kvällsmål', () => expect(at(22)).toBe('mellanmal'));
});

describe('sök', () => {
  const items = [{ name: 'Mjölkchoklad' }, { name: 'Ägg kokt' }, { name: 'Kyckling bröstfilé stekt' }, { name: 'Pannkaka m. ägg' }, { name: 'Ägg rått' }];
  it('början av namnet först', () => expect(rank(items, 'ägg').map((x) => x.name)).toEqual(['Ägg kokt', 'Ägg rått', 'Pannkaka m. ägg']));
  it('alla ord måste finnas', () => expect(rank(items, 'kyckling stekt').map((x) => x.name)).toEqual(['Kyckling bröstfilé stekt']));
  it('inga träffar', () => expect(rank(items, 'lax')).toEqual([]));
});

describe('Open Food Facts', () => {
  it('per 100 g och portion', () => {
    const f = offToFood({ product_name: 'Kvarg', brands: 'Arla, Arla Foods', serving_quantity: '150', nutriments: { 'energy-kcal_100g': 61, proteins_100g: 10, carbohydrates_100g: 3.6, fat_100g: 0.2 } }, '731');
    expect(f).toMatchObject({ id: 'off:731', name: 'Kvarg', brand: 'Arla', servingG: 150, per100: { kcal: 61, p: 10, c: 3.6, f: 0.2 } });
  });
  it('kJ räknas om till kcal', () => expect(offToFood({ product_name: 'X', nutriments: { 'energy-kj_100g': 550 } }, '1')!.per100.kcal).toBe(131));
  it('saknar energi → null', () => expect(offToFood({ product_name: 'X', nutriments: {} }, '1')).toBeNull());
});
