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

describe('styckvaror', () => {
  it('2 st ägg = 100 g', async () => {
    const { lvToFood } = await import('./engine');
    const egg = lvToFood([1225, 'Ägg rått', 136, 12.1, 0, 9.8]);
    expect(defaultAmount({ kind: 'food', food: egg })).toEqual({ unit: 'portion', value: 1 });
    await logPick({ kind: 'food', food: egg }, { unit: 'portion', value: 2 }, 'frukost', ['2026-11-30']);
    const [row] = await db.foodLog.where('date').equals('2026-11-30').toArray();
    expect(row).toMatchObject({ n: { kcal: 136 }, servingG: 50, unitLabel: 'st' });
  });
});

describe('matlådor', () => {
  it('räknas ner, kommer tillbaka vid ångra och kan lagas igen', async () => {
    const { deleteLogs, updateLog, cookAgain } = await import('./store');
    const r = await saveRecipe({
      name: 'Chili',
      ingredients: [{ name: 'Färs', grams: 1000, per100: { kcal: 200 } }, { name: 'Bönor', grams: 1000, per100: { kcal: 100 } }],
      portions: 5,
      batch: { total: 5, left: 5, madeAt: '2026-11-20' },
    });
    const left = async () => (await db.recipes.get(r.id))!.batch!.left;
    // 1 låda idag = 600 kcal
    const [a] = await logPick({ kind: 'recipe', recipe: r }, { unit: 'portion', value: 1 }, 'lunch', ['2026-11-20']);
    expect(await dayKcal('2026-11-20')).toBe(600);
    expect(await left()).toBe(4);
    // Matlåda tis–tors på en gång
    const ids = await logPick({ kind: 'recipe', recipe: (await db.recipes.get(r.id))! }, { unit: 'portion', value: 1 }, 'lunch', ['2026-11-24', '2026-11-25', '2026-11-26']);
    expect(await left()).toBe(1);
    // Ångra tisdag → lådan tillbaka
    await deleteLogs([ids[0]]);
    expect(await left()).toBe(2);
    // Åt en halv låda i stället för en hel idag
    await updateLog(a, { amount: { unit: 'portion', value: 0.5 } });
    expect(await left()).toBe(2.5);
    // Kopiera dagens lunch till fredag → en halv låda till
    await copyLogs('2026-11-20', '2026-11-27', 'lunch');
    expect(await left()).toBe(2);
    // Aldrig under noll
    await logPick({ kind: 'recipe', recipe: (await db.recipes.get(r.id))! }, { unit: 'portion', value: 5 }, 'middag', ['2026-11-28']);
    expect(await left()).toBe(0);
    await cookAgain(r.id, '2026-12-01');
    expect((await db.recipes.get(r.id))!.batch).toEqual({ total: 5, left: 5, madeAt: '2026-12-01' });
  });
});
