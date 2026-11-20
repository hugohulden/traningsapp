/**
 * Matlådor: en stor sats delad i lådor. "Ät en" loggar en låda till måltiden som passar klockan
 * och räknar ner tills satsen är slut.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNav } from '../../App';
import { db, type RecipeRec } from '../../db/db';
import { formatShort } from '../../lib/dates';
import { num } from '../../lib/format';
import { Button, Card } from '../../ui/ui';
import { useToday } from '../../ui/hooks';
import { toast } from '../../ui/toast';
import { MEAL_NAMES, mealForTime, recipePerPortion, recipeServingG } from '../engine';
import { adjustBoxes, cookAgain, deleteLogs, logPick } from '../store';
import { AddSheet } from './AddSheet';
import { kcalStr, macroStr } from './parts';

export function BatchesView() {
  const nav = useNav();
  const today = useToday();
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const [choose, setChoose] = useState<RecipeRec | null>(null);
  if (!recipes) return null;
  const batches = recipes.filter((r) => r.batch);
  const active = batches.filter((r) => r.batch!.left > 0).sort((a, b) => a.batch!.madeAt.localeCompare(b.batch!.madeAt));
  const done = batches.filter((r) => r.batch!.left <= 0).sort((a, b) => b.batch!.madeAt.localeCompare(a.batch!.madeAt));

  async function eatOne(r: RecipeRec) {
    const meal = mealForTime(new Date());
    const ids = await logPick({ kind: 'recipe', recipe: r }, { unit: 'portion', value: 1 }, meal, [today]);
    const left = Math.max(0, r.batch!.left - 1);
    toast(`${r.name} i ${MEAL_NAMES[meal].toLowerCase()} · ${left ? `${num(left, 1)} kvar` : 'satsen är slut'}`, () => void deleteLogs(ids));
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => nav.push({ name: 'recipe', batch: true })}>
        + Ny matlådesats
      </Button>

      {active.length === 0 && (
        <Card>
          <div className="font-semibold">Inga matlådor just nu</div>
          <div className="mt-1 text-sm text-mute">
            Lägg in allt som går i den stora satsen (sök eller skanna), ange hur många lådor det blev – sedan trycker du "Ät en" så loggas en låda och räknas ner tills satsen är slut.
          </div>
        </Card>
      )}

      {active.map((r) => {
        const per = recipePerPortion(r);
        const b = r.batch!;
        return (
          <Card key={r.id} className="relative isolate overflow-hidden !p-0">
            <div className="absolute -z-10 inset-y-0 left-0 w-1 bg-accent" />
            <button onClick={() => nav.push({ name: 'recipe', id: r.id, batch: true })} className="block w-full px-4 pt-3 text-left">
              <div className="flex items-baseline justify-between gap-2">
                <div className="truncate text-lg font-bold tracking-tight">{r.name}</div>
                <div className="shrink-0 text-sm font-semibold">{kcalStr(per.kcal)} kcal/låda</div>
              </div>
              <div className="text-xs text-mute">
                {macroStr(per)} · {recipeServingG(r)} g · lagad {formatShort(b.madeAt)}
              </div>
            </button>
            {/* Lådor kvar som rutor */}
            <div className="flex items-center gap-3 px-4 pt-3">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {Array.from({ length: b.total }, (_, i) => (
                  <span key={i} className={`h-3 w-5 rounded ${i < Math.ceil(b.left) ? 'bg-accent' : 'bg-panel2'}`} />
                ))}
              </div>
              <div className="shrink-0 text-sm">
                <b className="text-lg">{num(b.left, 1)}</b>
                <span className="text-mute"> av {b.total} kvar</span>
              </div>
            </div>
            <div className="grid grid-cols-[44px_1fr_1fr] gap-2 p-4 pt-3">
              <button onClick={() => void adjustBoxes(r.id, -1)} className="min-h-12 rounded-2xl bg-panel2 text-lg text-mute" aria-label="En låda mindre utan att logga">
                −1
              </button>
              <Button kind="soft" onClick={() => setChoose(r)}>
                Välj dag…
              </Button>
              <Button onClick={() => void eatOne(r)}>Ät en</Button>
            </div>
          </Card>
        );
      })}

      {done.length > 0 && (
        <div className="pt-2">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Slut</div>
          {done.map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
              <button onClick={() => nav.push({ name: 'recipe', id: r.id, batch: true })} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-mute">
                  {r.batch!.total} lådor · {kcalStr(recipePerPortion(r).kcal)} kcal/låda · lagad {formatShort(r.batch!.madeAt)}
                </div>
              </button>
              <Button
                kind="soft"
                className="shrink-0 !min-h-11 text-sm"
                onClick={async () => {
                  await cookAgain(r.id, today);
                  toast(`${r.name}: ${r.batch!.total} nya lådor`);
                }}
              >
                Laga igen
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddSheet
        open={!!choose}
        onClose={() => setChoose(null)}
        date={today}
        meal={mealForTime(new Date())}
        initialPick={choose ? { kind: 'recipe', recipe: choose } : undefined}
      />
    </div>
  );
}
