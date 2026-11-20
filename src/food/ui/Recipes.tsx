/** Sparade rätter och matlådor: lista, skapa, redigera, logga. */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNav } from '../../App';
import { db, type RecipeIngredient, type RecipeRec } from '../../db/db';
import { num, parseNum } from '../../lib/format';
import { Button, Card, Field, Header, inputCls } from '../../ui/ui';
import { ask } from '../../ui/confirm';
import { useToday } from '../../ui/hooks';
import { mealForTime, recipePerPortion, recipeServingG, recipeTotal, forGrams } from '../engine';
import { deleteRecipe, saveRecipe } from '../store';
import { AddSheet } from './AddSheet';
import { kcalStr, macroStr } from './parts';

export function RecipesScreen() {
  const nav = useNav();
  const today = useToday();
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const [logging, setLogging] = useState<RecipeRec | null>(null);
  const sorted = [...(recipes ?? [])].sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt));
  return (
    <div className="pb-10">
      <Header title="Rätter" sub="Matlådor och egna recept" onBack={() => nav.pop()} />
      <div className="space-y-3 p-4">
        <Button className="w-full" onClick={() => nav.push({ name: 'recipe' })}>
          + Ny rätt
        </Button>
        {recipes && !recipes.length && (
          <Card>
            <div className="font-semibold">Inga rätter än</div>
            <div className="mt-1 text-sm text-mute">
              Lägg ihop ingredienser (sök eller skanna), ange hur många portioner det blir – sedan loggar du "1 portion Kycklinggryta" med ett tryck, även flera dagar på en gång.
            </div>
          </Card>
        )}
        {sorted.map((r) => {
          const per = recipePerPortion(r);
          return (
            <Card key={r.id} className="!p-0 overflow-hidden">
              <button onClick={() => nav.push({ name: 'recipe', id: r.id })} className="block w-full px-4 pt-3 pb-2 text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate text-lg font-bold">
                    {r.favorite ? '★ ' : ''}
                    {r.name}
                  </div>
                  <div className="shrink-0 text-sm font-semibold">{kcalStr(per.kcal)} kcal</div>
                </div>
                <div className="text-xs text-mute">
                  per portion ({recipeServingG(r)} g) · {macroStr(per)} · {r.batch ? `matlåda: ${num(r.batch.left, 1)} av ${r.batch.total} kvar` : `${r.portions} portioner`} · {r.ingredients.length} ingredienser
                </div>
              </button>
              <div className="grid grid-cols-2 gap-2 px-4 pb-3">
                <Button kind="soft" onClick={() => nav.push({ name: 'recipe', id: r.id })}>
                  Ändra
                </Button>
                <Button onClick={() => setLogging(r)}>Logga</Button>
              </div>
            </Card>
          );
        })}
      </div>
      <AddSheet
        open={!!logging}
        onClose={() => setLogging(null)}
        date={today}
        meal={mealForTime(new Date())}
        initialPick={logging ? { kind: 'recipe', recipe: logging } : undefined}
      />
    </div>
  );
}

export function RecipeEditor({ id, batch: batchProp }: { id?: string; batch?: boolean }) {
  const nav = useNav();
  const today = useToday();
  const existing = useLiveQuery(() => (id ? db.recipes.get(id) : undefined), [id]);
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [ings, setIngs] = useState<RecipeIngredient[]>([]);
  const [portions, setPortions] = useState('4');
  const [weight, setWeight] = useState('');
  const [picking, setPicking] = useState(false);
  const [left, setLeft] = useState('');
  const batch = batchProp || !!existing?.batch;

  if (id && existing && !loaded) {
    setName(existing.name);
    setIngs(existing.ingredients);
    setPortions(String(existing.portions));
    setWeight(existing.totalWeightG ? String(existing.totalWeightG) : '');
    setLeft(existing.batch ? num(existing.batch.left, 2) : '');
    setLoaded(true);
  }
  if (id && !loaded) return <div className="p-8 text-mute">Laddar…</div>;

  const draft = { ingredients: ings, portions: parseNum(portions) ?? 1, totalWeightG: parseNum(weight) ?? undefined };
  const total = recipeTotal(draft);
  const per = recipePerPortion(draft);
  const valid = name.trim() && ings.length > 0 && (parseNum(portions) ?? 0) > 0;

  async function save() {
    const total = Math.round(draft.portions);
    // Matlådesats: antal lådor = portioner. Ny sats börjar full; ändrat antal flyttar "kvar" lika mycket.
    const batchVal = batch
      ? {
          total,
          left: Math.max(0, Math.min(total, parseNum(left) ?? (existing?.batch ? existing.batch.left + (total - existing.batch.total) : total))),
          madeAt: existing?.batch?.madeAt ?? today,
        }
      : existing?.batch;
    await saveRecipe({ id, name: name.trim(), ingredients: ings, portions: batch ? total : draft.portions, totalWeightG: draft.totalWeightG && draft.totalWeightG > 0 ? draft.totalWeightG : undefined, favorite: existing?.favorite, lastAmount: existing?.lastAmount, lastUsedAt: existing?.lastUsedAt, batch: batchVal });
    nav.pop();
  }

  return (
    <div className="pb-10">
      <Header title={batch ? (id ? 'Matlådesats' : 'Ny matlådesats') : id ? 'Ändra rätt' : 'Ny rätt'} onBack={() => nav.pop()} />
      <div className="space-y-4 p-4">
        <Field label="Namn">
          <input className={inputCls} placeholder={batch ? 't.ex. Kycklinggryta v. 48' : 't.ex. Kycklinggryta'} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="font-semibold">Ingredienser</div>
            <div className="text-sm text-mute">
              {num(total.grams, 0)} g · {kcalStr(total.kcal)} kcal
            </div>
          </div>
          {ings.length === 0 && <div className="py-2 text-sm text-mute">Lägg till det som går i rätten, i gram (okokt/rå vikt om det är så du väger).</div>}
          {ings.map((ing, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{ing.name}</div>
                <div className="text-xs text-mute">{kcalStr(forGrams(ing.per100, ing.grams).kcal)} kcal</div>
              </div>
              <div className="relative w-24 shrink-0">
                <input
                  className={`${inputCls} min-h-11 pr-7 text-right text-base`}
                  inputMode="decimal"
                  value={String(ing.grams)}
                  onChange={(e) => {
                    const g = parseNum(e.target.value) ?? 0;
                    setIngs((x) => x.map((y, j) => (j === i ? { ...y, grams: g } : y)));
                  }}
                  aria-label={`Gram ${ing.name}`}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-mute">g</span>
              </div>
              <button onClick={() => setIngs((x) => x.filter((_, j) => j !== i))} className="h-11 w-9 shrink-0 text-lg text-mute" aria-label={`Ta bort ${ing.name}`}>
                ✕
              </button>
            </div>
          ))}
          <Button kind="soft" className="mt-2 w-full" onClick={() => setPicking(true)}>
            + Lägg till ingrediens
          </Button>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Field label={batch ? 'Antal matlådor' : 'Antal portioner'}>
            <input className={inputCls} inputMode={batch ? 'numeric' : 'decimal'} value={portions} onChange={(e) => setPortions(e.target.value)} />
          </Field>
          <Field label="Färdig vikt g (valfritt)" hint="Väg grytan – då kan du logga i gram.">
            <input className={inputCls} inputMode="decimal" placeholder={String(num(total.grams, 0))} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </div>

        {batch && id && (
          <Field label="Lådor kvar" hint="Ändras automatiskt när du äter en. Rätta här om du gett bort eller slängt en.">
            <input className={inputCls} inputMode="decimal" value={left} onChange={(e) => setLeft(e.target.value)} />
          </Field>
        )}

        <div className="ring-grad rounded-3xl p-4 text-center">
          <div className="text-[11px] uppercase tracking-wider text-mute">
            Per {batch ? 'låda' : 'portion'} ({recipeServingG(draft)} g)
          </div>
          <div className="text-grad text-4xl font-black tracking-tighter">{kcalStr(per.kcal)}</div>
          <div className="text-sm text-mute">kcal · {macroStr(per) || 'makron saknas'}</div>
        </div>

        <Button className="w-full" disabled={!valid} onClick={() => void save()}>
          {batch ? (id ? 'Spara' : `Spara ${Math.round(parseNum(portions) ?? 0)} matlådor`) : 'Spara rätt'}
        </Button>
        {id && (
          <Button
            kind="danger"
            className="w-full"
            onClick={async () => {
              if (!(await ask(`Ta bort ${name || 'rätten'}? Det du redan loggat ligger kvar.`, { ok: 'Ta bort', danger: true }))) return;
              await deleteRecipe(id);
              nav.pop();
            }}
          >
            {batch ? 'Ta bort satsen' : 'Ta bort rätt'}
          </Button>
        )}
      </div>
      <AddSheet
        open={picking}
        mode="pick"
        onClose={() => setPicking(false)}
        date={today}
        meal="lunch"
        onPick={({ pick, grams }) => {
          // En rätt kan bli ingrediens i en annan: använd dess värden per 100 g.
          const per100 =
            pick.kind === 'food'
              ? pick.food.per100
              : (() => {
                  const t = recipeTotal(pick.recipe);
                  const w = pick.recipe.totalWeightG || t.grams || 1;
                  const k = 100 / w;
                  return { kcal: Math.round(t.kcal * k), p: Math.round(t.p * k * 10) / 10, c: Math.round(t.c * k * 10) / 10, f: Math.round(t.f * k * 10) / 10 };
                })();
          setIngs((x) => [...x, { foodId: pick.kind === 'food' ? pick.food.id : undefined, name: pick.kind === 'food' ? pick.food.name : pick.recipe.name, grams: Math.round(grams), per100 }]);
          setPicking(false);
        }}
      />
    </div>
  );
}
