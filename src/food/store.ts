/** Kaloriräknarens dataåtgärder (IndexedDB via Dexie) och nätanrop. */
import { db, uid, type Amount, type FoodLogRec, type FoodRec, type Meal, type Nutrients, type RecipeRec } from '../db/db';
import { addDays } from '../lib/dates';
import { amountToGrams, forGrams, lvToFood, offToFood, recipeFor, recipeServingG, type LvRow, type OffProduct } from './engine';

/** Ett livsmedel som ännu inte behöver finnas i databasen (t.ex. från Livsmedelsverket eller en sökning). */
export type FoodLike = Omit<FoodRec, 'updatedAt'>;

export type Pick = { kind: 'food'; food: FoodLike } | { kind: 'recipe'; recipe: RecipeRec };

export function pickName(p: Pick): string {
  return p.kind === 'food' ? p.food.name : p.recipe.name;
}

export function pickServingG(p: Pick): number | undefined {
  return p.kind === 'food' ? p.food.servingG : recipeServingG(p.recipe);
}

/** Näringsvärden för en mängd. */
export function pickNutrients(p: Pick, a: Amount): Nutrients | null {
  if (p.kind === 'recipe') return recipeFor(p.recipe, a);
  const g = amountToGrams(a, p.food.servingG);
  return g == null ? null : forGrams(p.food.per100, g);
}

/** Förifylld mängd: senaste gången, annars en portion, annars 100 g. */
export function defaultAmount(p: Pick): Amount {
  if (p.kind === 'recipe') return p.recipe.lastAmount ?? { unit: 'portion', value: 1 };
  return p.food.lastAmount ?? (p.food.servingG ? { unit: 'portion', value: 1 } : { unit: 'g', value: 100 });
}

// ---------------------------------------------------------------------------
// Logga
// ---------------------------------------------------------------------------

/** Loggar en vara på en eller flera dagar. Returnerar de nya loggradernas id. */
export async function logPick(p: Pick, amount: Amount, meal: Meal, dates: string[]): Promise<string[]> {
  const n = pickNutrients(p, amount);
  if (!n) throw new Error('Mängden saknar vikt.');
  const now = Date.now();
  const ids: string[] = [];
  await db.transaction('rw', [db.foodLog, db.foods, db.recipes], async () => {
    for (const date of dates) {
      const rec: FoodLogRec = {
        id: uid(),
        date,
        meal,
        name: pickName(p),
        n,
        amount,
        servingG: pickServingG(p),
        ref: p.kind === 'food' ? { kind: 'food', id: p.food.id } : { kind: 'recipe', id: p.recipe.id },
        createdAt: now,
      };
      await db.foodLog.put(rec);
      ids.push(rec.id);
    }
    if (p.kind === 'food') {
      const cur = await db.foods.get(p.food.id);
      await db.foods.put({ ...p.food, ...(cur ?? {}), lastAmount: amount, lastUsedAt: now, updatedAt: now });
    } else {
      await db.recipes.update(p.recipe.id, { lastAmount: amount, lastUsedAt: now });
    }
  });
  return ids;
}

/** Snabbkalorier: bara ett kcal-tal och en valfri beskrivning. */
export async function logQuick(kcal: number, text: string, meal: Meal, date: string, macros: Omit<Nutrients, 'kcal'> = {}): Promise<string> {
  const rec: FoodLogRec = { id: uid(), date, meal, name: text.trim() || 'Snabbkalorier', n: { kcal: Math.round(kcal), ...macros }, ref: { kind: 'quick' }, createdAt: Date.now() };
  await db.foodLog.put(rec);
  return rec.id;
}

export async function updateLog(id: string, patch: Partial<FoodLogRec>) {
  await db.foodLog.update(id, patch);
}

export async function deleteLogs(ids: string[]) {
  await db.foodLog.bulkDelete(ids);
}

/** Kopierar en måltid (eller hela dagen om meal är null) till en annan dag. */
export async function copyLogs(from: string, to: string, meal: Meal | null, toMeal?: Meal): Promise<number> {
  const rows = (await db.foodLog.where('date').equals(from).toArray()).filter((r) => !meal || r.meal === meal);
  const now = Date.now();
  await db.foodLog.bulkPut(rows.map((r, i) => ({ ...r, id: uid(), date: to, meal: toMeal ?? r.meal, createdAt: now + i })));
  return rows.length;
}

/** Dagens förbrukning från Garmin. Null tar bort värdet. */
export async function setBurned(date: string, kcal: number | null) {
  if (kcal && kcal > 0) await db.foodDays.put({ date, burnedKcal: Math.round(kcal) });
  else await db.foodDays.delete(date);
}

// ---------------------------------------------------------------------------
// Livsmedel och favoriter
// ---------------------------------------------------------------------------

export async function saveFood(f: FoodLike): Promise<FoodRec> {
  const cur = await db.foods.get(f.id);
  const rec: FoodRec = { ...(cur ?? {}), ...f, updatedAt: Date.now() };
  await db.foods.put(rec);
  return rec;
}

/** Ny egen produkt (valfritt kopplad till en streckkod). */
export async function createCustomFood(input: { name: string; per100: Nutrients; servingG?: number; barcode?: string }): Promise<FoodRec> {
  return saveFood({
    id: input.barcode ? `off:${input.barcode}` : `egen:${uid()}`,
    source: 'egen',
    name: input.name.trim(),
    barcode: input.barcode,
    per100: input.per100,
    servingG: input.servingG,
    saved: true,
  });
}

export async function toggleFavorite(p: Pick): Promise<boolean> {
  if (p.kind === 'recipe') {
    const v = !p.recipe.favorite;
    await db.recipes.update(p.recipe.id, { favorite: v });
    return v;
  }
  const cur = await db.foods.get(p.food.id);
  const v = !(cur?.favorite ?? p.food.favorite);
  await saveFood({ ...p.food, ...(cur ?? {}), favorite: v });
  return v;
}

export async function isFavorite(p: Pick): Promise<boolean> {
  if (p.kind === 'recipe') return !!(await db.recipes.get(p.recipe.id))?.favorite;
  return !!(await db.foods.get(p.food.id))?.favorite;
}

/** Senast ätna och favoriter (livsmedel och rätter), nyast först. */
export async function recentAndFavorites(): Promise<{ recent: Pick[]; favorites: Pick[] }> {
  const foods = await db.foods.toArray();
  const recipes = await db.recipes.toArray();
  const all: (Pick & { t: number; fav: boolean })[] = [
    ...foods.map((f) => ({ kind: 'food' as const, food: f, t: f.lastUsedAt ?? 0, fav: !!f.favorite })),
    ...recipes.map((r) => ({ kind: 'recipe' as const, recipe: r, t: r.lastUsedAt ?? 0, fav: !!r.favorite })),
  ];
  return {
    recent: all.filter((x) => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 30),
    favorites: all.filter((x) => x.fav).sort((a, b) => pickName(a).localeCompare(pickName(b), 'sv')),
  };
}

// ---------------------------------------------------------------------------
// Rätter
// ---------------------------------------------------------------------------

export async function saveRecipe(r: Omit<RecipeRec, 'updatedAt' | 'id'> & { id?: string }): Promise<RecipeRec> {
  const cur = r.id ? await db.recipes.get(r.id) : undefined;
  const rec: RecipeRec = { ...(cur ?? {}), ...r, id: r.id ?? uid(), updatedAt: Date.now() };
  await db.recipes.put(rec);
  return rec;
}

export async function deleteRecipe(id: string) {
  await db.recipes.delete(id);
}

// ---------------------------------------------------------------------------
// Livsmedelsverket (lokal fil) och Open Food Facts (nät)
// ---------------------------------------------------------------------------

let lvCache: ReturnType<typeof lvToFood>[] | null = null;

/** Livsmedelsverkets livsmedelsdatabas, laddas första gången den behövs (ingår i appen, fungerar offline). */
export async function loadLivsmedel() {
  if (lvCache) return lvCache;
  const mod = (await import('./data/livsmedel.json')) as unknown as { default: { f: LvRow[] } };
  lvCache = mod.default.f.map(lvToFood);
  return lvCache;
}

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_sv,brands,nutriments,serving_quantity,serving_size';

export class OffError extends Error {}

/** Slår upp en streckkod: först lokalt (egna och tidigare skannade), sedan Open Food Facts. */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<{ food: FoodRec | null; offline?: boolean }> {
  const local = await db.foods.where('barcode').equals(code).first();
  if (local) return { food: local };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { food: null, offline: true };
  let res: Response;
  try {
    res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { food: null, offline: true };
  }
  if (res.status === 404) return { food: null };
  if (!res.ok) throw new OffError(`Open Food Facts svarade ${res.status}.`);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (!data.product || data.status === 0) return { food: null };
  const f = offToFood(data.product, code);
  if (!f) return { food: null };
  return { food: await saveFood(f) };
}

/** Söker märkesvaror i Open Food Facts (kräver nät; tjänsten är ibland överbelastad). */
export async function searchOff(query: string, signal?: AbortSignal): Promise<FoodLike[]> {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new OffError(res.status === 503 ? 'Open Food Facts är överbelastat just nu.' : `Open Food Facts svarade ${res.status}.`);
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map((p) => offToFood(p)).filter((x): x is NonNullable<typeof x> => !!x && !!x.barcode);
}

/** Dagar framåt från ett datum (för matlådor). */
export function nextDays(from: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}
