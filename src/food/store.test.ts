import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { sumNutrients } from './engine';
import { copyLogs, createCustomFood, defaultAmount, logPick, logQuick, recentAndFavorites, saveRecipe, toggleFavorite, lookupBarcode } from './store';

const dayKcal = async (d: string) => sumNutrients((await db.foodLog.where('date').equals(d).toArray()).map((l) => l.n)).kcal;

beforeEach(async () => {
  await Promise.all([db.foodLog.clear(), db.foods.clear(), db.recipes.clear(), db.foodDays.clear()]);
});

describe('loggning', () => {
  it('rätt loggas på fyra dagar till lunch och summorna stämmer', async () => {
    const r = await saveRecipe({
      name: 'Kycklinggryta',
      ingredients: [
        { name: 'Kyckling', grams: 800, per100: { kcal: 116, p: 23, c: 0, f: 2.5 } },
        { name: 'Ris okokt', grams: 400, per100: { kcal: 359, p: 9.2, c: 76.7, f: 1 } },
        { name: 'Grädde', grams: 200, per100: { kcal: 340, p: 2, c: 3, f: 36 } },
      ],
      portions: 4,
    });
    const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'];
    await logPick({ kind: 'recipe', recipe: r }, { unit: 'portion', value: 1 }, 'lunch', days);
    for (const d of days) expect(await dayKcal(d)).toBe(761);
    expect(await dayKcal('2026-11-27')).toBe(0);
    // Nästa gång föreslås samma mängd, och rätten ligger överst i "senast ätna".
    const fresh = (await db.recipes.get(r.id))!;
    expect(defaultAmount({ kind: 'recipe', recipe: fresh })).toEqual({ unit: 'portion', value: 1 });
    expect((await recentAndFavorites()).recent[0]).toMatchObject({ kind: 'recipe' });
  });

  it('livsmedel i gram och portioner, plus snabbkalorier', async () => {
    const egg = { id: 'lv:2205', source: 'lv' as const, name: 'Ägg kokt', per100: { kcal: 136, p: 12.1, c: 0, f: 9.8 } };
    await logPick({ kind: 'food', food: egg }, { unit: 'g', value: 120 }, 'frukost', ['2026-11-20']);
    const bar = await createCustomFood({ name: 'Bar', per100: { kcal: 360, p: 20 }, servingG: 55, barcode: '2099999999992' });
    await logPick({ kind: 'food', food: bar }, { unit: 'portion', value: 2 }, 'mellanmal', ['2026-11-20']);
    await logQuick(500, 'Lunch på jobbet', 'lunch', '2026-11-20');
    // 163 + 2 × 198 + 500
    expect(await dayKcal('2026-11-20')).toBe(163 + 396 + 500);
    // Egen produkt hittas på streckkoden utan nät.
    expect((await lookupBarcode('2099999999992')).food?.name).toBe('Bar');
  });

  it('favoriter', async () => {
    const egg = { id: 'lv:2205', source: 'lv' as const, name: 'Ägg kokt', per100: { kcal: 136 } };
    expect(await toggleFavorite({ kind: 'food', food: egg })).toBe(true);
    expect((await recentAndFavorites()).favorites.map((x) => (x.kind === 'food' ? x.food.name : ''))).toEqual(['Ägg kokt']);
  });

  it('kopiera måltid och hel dag', async () => {
    await logQuick(400, 'Gröt', 'frukost', '2026-11-20');
    await logQuick(800, 'Pasta', 'middag', '2026-11-20');
    expect(await copyLogs('2026-11-20', '2026-11-21', 'frukost')).toBe(1);
    expect(await dayKcal('2026-11-21')).toBe(400);
    expect(await copyLogs('2026-11-20', '2026-11-22', null)).toBe(2);
    expect(await dayKcal('2026-11-22')).toBe(1200);
    // Originalet är orört.
    expect(await dayKcal('2026-11-20')).toBe(1200);
  });
});
