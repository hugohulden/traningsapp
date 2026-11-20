/**
 * "+"-arket: sök, skanna, foto, snabbval och snabbkalorier.
 * I läget "pick" används samma ark för att välja ingredienser till en rätt.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Amount, type Meal } from '../../db/db';
import { DAY_SHORT, formatShort, weekday } from '../../lib/dates';
import { num, parseNum } from '../../lib/format';
import { Button, Field, Sheet, inputCls } from '../../ui/ui';
import { toast } from '../../ui/toast';
import { MEAL_NAMES, rank, recipePerPortion, unitText, withUnit } from '../engine';
import {
  createCustomFood,
  defaultAmount,
  deleteLogs,
  isFavorite,
  loadLivsmedel,
  logPick,
  logQuick,
  nextDays,
  OffError,
  pickName,
  pickNutrients,
  pickServingG,
  pickUnit,
  recentAndFavorites,
  searchOff,
  toggleFavorite,
  type FoodLike,
  type Pick,
} from '../store';
import { amountStr, ItemRow, kcalStr, macroStr, MealPicker } from './parts';

const ScanPane = lazy(() => import('./ScanPane'));

type TabId = 'sok' | 'skanna' | 'snabb' | 'kcal';

const TAB_LABEL: Record<TabId, string> = { sok: 'Sök', skanna: 'Skanna', snabb: 'Snabbval', kcal: 'Kcal' };

const ICON: Record<TabId, ReactNode> = {
  sok: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5" />,
  skanna: <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8" />,
  snabb: <path d="M13 3 5 13h6l-1 8 8-10h-6z" />,
  kcal: <path d="M12 3c3 4 6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 10 9 8 9 5c1.5 1 2.5 2 3 3.5" />,
};

export interface PickResult {
  pick: Pick;
  grams: number;
}

export function AddSheet({
  open,
  onClose,
  date,
  meal: initialMeal,
  mode = 'log',
  onPick,
  startTab,
  initialPick,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  meal: Meal;
  mode?: 'log' | 'pick';
  onPick?: (r: PickResult) => void;
  startTab?: TabId;
  /** Öppna direkt på mängdvyn för en vara (t.ex. en rätt). */
  initialPick?: Pick;
}) {
  const [tab, setTab] = useState<TabId>(startTab ?? (mode === 'pick' ? 'sok' : 'snabb'));
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [selected, setSelected] = useState<Pick | null>(null);
  const [newFood, setNewFood] = useState<{ barcode?: string; name?: string } | null>(null);

  useEffect(() => {
    if (open) {
      setMeal(initialMeal);
      setSelected(initialPick ?? null);
      setNewFood(null);
      setTab(startTab ?? (mode === 'pick' ? 'sok' : 'snabb'));
    }
  }, [open, initialMeal, mode, startTab, initialPick]);

  const tabs: TabId[] = mode === 'pick' ? ['sok', 'skanna', 'snabb'] : ['sok', 'skanna', 'snabb', 'kcal'];
  const title = selected ? pickName(selected) : newFood ? 'Ny produkt' : mode === 'pick' ? 'Lägg till ingrediens' : `Lägg till · ${MEAL_NAMES[meal]}`;
  // Tillbaka från en skannad vara går till Sök (annars läser kameran samma kod direkt igen).
  const back =
    (selected && !initialPick) || newFood
      ? () => {
          setSelected(null);
          setNewFood(null);
          if (tab === 'skanna') setTab('sok');
        }
      : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={title} onBack={back}>
      {selected ? (
        <AmountView
          pick={selected}
          mode={mode}
          meal={meal}
          setMeal={setMeal}
          date={date}
          onLogged={() => {
            setSelected(null);
            onClose();
          }}
          onPicked={(grams) => {
            onPick?.({ pick: selected, grams });
            setSelected(null);
          }}
        />
      ) : newFood ? (
        <NewFoodForm init={newFood} onSaved={(f) => (setNewFood(null), setSelected({ kind: 'food', food: f }))} />
      ) : (
        <div className="space-y-3">
          {mode === 'log' && <MealPicker value={meal} onChange={setMeal} />}
          <div className={`grid gap-1.5 ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold ${tab === t ? 'bg-accent/15 text-accent' : 'bg-panel2 text-mute'}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {ICON[t]}
                </svg>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          {tab === 'sok' && <SearchPane onSelect={setSelected} onNewFood={(name) => setNewFood({ name })} />}
          {tab === 'snabb' && <QuickPane mode={mode} meal={meal} date={date} onSelect={setSelected} />}
          {tab === 'kcal' && <KcalPane meal={meal} date={date} onDone={onClose} />}
          {tab === 'skanna' && (
            <Suspense fallback={<Loading text="Startar kameran…" />}>
              <ScanPane onFound={(f) => setSelected({ kind: 'food', food: f })} onNotFound={(barcode) => setNewFood({ barcode })} />
            </Suspense>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-mute">{text}</div>;
}

function per100Sub(f: FoodLike): string {
  const unit = f.servingG && f.unitLabel ? `1 ${f.unitLabel} ≈ ${f.servingG} g = ${kcalStr((f.per100.kcal * f.servingG) / 100)} kcal` : '';
  return [unit, `${kcalStr(f.per100.kcal)} kcal/100 g`, f.brand, unit ? '' : macroStr(f.per100)].filter(Boolean).join(' · ');
}

function pickSub(p: Pick): string {
  if (p.kind === 'recipe') {
    const n = recipePerPortion(p.recipe);
    return `${kcalStr(n.kcal)} kcal/portion · ${macroStr(n)}`;
  }
  return per100Sub(p.food);
}

// ---------------------------------------------------------------------------
// Sök
// ---------------------------------------------------------------------------

function SearchPane({ onSelect, onNewFood }: { onSelect: (p: Pick) => void; onNewFood: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [lv, setLv] = useState<FoodLike[] | null>(null);
  const [off, setOff] = useState<{ q: string; items: FoodLike[]; loading: boolean; error?: string }>({ q: '', items: [], loading: false });
  const personal = useLiveQuery(async () => ({ foods: await db.foods.toArray(), recipes: await db.recipes.toArray() }), []);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadLivsmedel().then(setLv);
    ref.current?.focus();
  }, []);

  // Open Food Facts: vänta tills du slutat skriva (tjänsten tål inte många anrop).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || !navigator.onLine) {
      setOff({ q: term, items: [], loading: false });
      return;
    }
    const ac = new AbortController();
    setOff((o) => ({ ...o, q: term, loading: true, error: undefined }));
    const t = setTimeout(() => {
      searchOff(term, ac.signal)
        .then((items) => setOff({ q: term, items, loading: false }))
        .catch((e) => {
          if ((e as Error).name === 'AbortError') return;
          setOff({ q: term, items: [], loading: false, error: e instanceof OffError ? e.message : 'Kunde inte nå Open Food Facts.' });
        });
    }, 700);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  const res = useMemo(() => {
    const term = q.trim();
    if (!term || !personal) return null;
    // Dina egna, sparade rätter och senast ätna först.
    const mine: (Pick & { name: string; tag: string; t: number })[] = [
      ...personal.recipes.map((r) => ({ kind: 'recipe' as const, recipe: r, name: r.name, tag: r.batch ? (r.batch.left > 0 ? `Låda · ${num(r.batch.left, 1)} kvar` : 'Låda · slut') : 'Rätt', t: r.lastUsedAt ?? 1 })),
      ...personal.foods
        .filter((f) => f.saved || f.lastUsedAt || f.favorite)
        .map((f) => ({ kind: 'food' as const, food: withUnit(f), name: f.name, tag: f.saved ? 'Egen' : f.favorite ? '★' : 'Senast', t: f.lastUsedAt ?? 0 })),
    ];
    const top = rank(mine, term, 8);
    const seen = new Set(top.map((x) => (x.kind === 'food' ? x.food.id : x.recipe.id)));
    const lvHits = lv ? rank(lv, term, 25).filter((f) => !seen.has(f.id)) : [];
    return { top, lvHits };
  }, [q, lv, personal]);

  const offHits = off.q === q.trim() ? off.items.filter((f) => !res?.top.some((x) => x.kind === 'food' && x.food.id === f.id)) : [];

  return (
    <div>
      <input
        ref={ref}
        className={inputCls}
        placeholder="Sök t.ex. ägg, ris, kvarg…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
      />
      {!q.trim() && <div className="py-4 text-sm text-mute">Skriv för att söka bland dina rätter, Livsmedelsverkets livsmedel och märkesvaror.</div>}
      {res && (
        <div className="mt-2">
          {res.top.length > 0 && (
            <Section title="Dina">
              {res.top.map((p) => (
                <ItemRow key={p.kind === 'food' ? p.food.id : p.recipe.id} tag={p.tag} title={p.name} sub={pickSub(p)} onClick={() => onSelect(p)} />
              ))}
            </Section>
          )}
          <Section title="Livsmedelsverket">
            {!lv && <div className="py-2 text-sm text-mute">Laddar…</div>}
            {lv && res.lvHits.length === 0 && <div className="py-2 text-sm text-mute">Inga träffar.</div>}
            {res.lvHits.map((f) => (
              <ItemRow key={f.id} title={f.name} sub={per100Sub(f)} onClick={() => onSelect({ kind: 'food', food: f })} />
            ))}
          </Section>
          <Section title="Märkesvaror (Open Food Facts)">
            {!navigator.onLine && <div className="py-2 text-sm text-mute">Kräver internet.</div>}
            {navigator.onLine && q.trim().length < 3 && <div className="py-2 text-sm text-mute">Skriv minst 3 tecken.</div>}
            {off.loading && <div className="py-2 text-sm text-mute">Söker…</div>}
            {off.error && <div className="py-2 text-sm text-warn">{off.error}</div>}
            {!off.loading && !off.error && off.q.length >= 3 && offHits.length === 0 && <div className="py-2 text-sm text-mute">Inga träffar.</div>}
            {offHits.map((f) => (
              <ItemRow key={f.id} title={f.name} sub={per100Sub(f)} onClick={() => onSelect({ kind: 'food', food: f })} />
            ))}
          </Section>
          <button onClick={() => onNewFood(q.trim())} className="mt-2 w-full rounded-2xl border border-dashed border-line py-3 text-sm text-mute">
            + Lägg in egen produkt "{q.trim()}"
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">{title}</div>
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snabbval: senast ätna och favoriter – ett tryck loggar samma mängd som förra gången
// ---------------------------------------------------------------------------

function QuickPane({ mode, meal, date, onSelect }: { mode: 'log' | 'pick'; meal: Meal; date: string; onSelect: (p: Pick) => void }) {
  const lists = useLiveQuery(recentAndFavorites, []);
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!lists) return <Loading text="Laddar…" />;
  const key = (p: Pick) => (p.kind === 'food' ? p.food.id : p.recipe.id);

  async function quickLog(p: Pick) {
    if (mode === 'pick') return onSelect(p);
    const a = defaultAmount(p);
    if (!pickNutrients(p, a)) return onSelect(p);
    const ids = await logPick(p, a, meal, [date]);
    setDone((s) => new Set(s).add(key(p)));
    const left = p.kind === 'recipe' && p.recipe.batch ? Math.max(0, p.recipe.batch.left - 1) : null;
    toast(`${pickName(p)} loggad i ${MEAL_NAMES[meal].toLowerCase()}${left != null ? ` · ${left ? `${num(left, 1)} kvar` : 'satsen är slut'}` : ''}`, () => void deleteLogs(ids));
  }

  const row = (p: Pick) => {
    const a = defaultAmount(p);
    const n = pickNutrients(p, a);
    const k = key(p);
    return (
      <ItemRow
        key={k}
        tag={p.kind === 'recipe' ? (p.recipe.batch ? 'Låda' : 'Rätt') : undefined}
        title={pickName(p)}
        sub={
          p.kind === 'recipe' && p.recipe.batch
            ? `1 låda · ${n ? `${kcalStr(n.kcal)} kcal · ` : ''}${num(p.recipe.batch.left, 1)} av ${p.recipe.batch.total} kvar`
            : `${amountStr(a, pickServingG(p), pickUnit(p))}${n ? ` · ${kcalStr(n.kcal)} kcal` : ''}`
        }
        right={done.has(k) ? <span className="font-bold text-accent">✓</span> : <span className="text-2xl leading-none text-accent">+</span>}
        onClick={() => void quickLog(p)}
        onSide={() => onSelect(p)}
        sideLabel="Ändra mängd"
      />
    );
  };

  if (!lists.recent.length && !lists.favorites.length && !lists.batches.length)
    return <div className="py-6 text-center text-sm text-mute">Här hamnar det du ätit senast och dina favoriter (★). Sök eller skanna för att börja.</div>;

  return (
    <div>
      {mode === 'log' && <div className="text-xs text-mute">Tryck på en rad för att logga samma mängd som förra gången. ✎ ändrar mängden.</div>}
      {lists.batches.length > 0 && <Section title="Matlådor">{lists.batches.map(row)}</Section>}
      {lists.favorites.length > 0 && <Section title="Favoriter">{lists.favorites.map(row)}</Section>}
      {lists.recent.length > 0 && <Section title="Senast ätna">{lists.recent.map(row)}</Section>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snabbkalorier
// ---------------------------------------------------------------------------

function KcalPane({ meal, date, onDone }: { meal: Meal; date: string; onDone: () => void }) {
  const [kcal, setKcal] = useState('');
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const k = parseNum(kcal);
  return (
    <div className="space-y-3">
      <Field label="Kalorier">
        <input ref={ref} className={`${inputCls} text-3xl font-bold`} inputMode="numeric" placeholder="0" value={kcal} onChange={(e) => setKcal(e.target.value)} />
      </Field>
      <Field label="Beskrivning (valfritt)">
        <input className={inputCls} placeholder="t.ex. Lunch på jobbet" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {more ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Protein g">
            <input className={inputCls} inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
          </Field>
          <Field label="Kolhydr. g">
            <input className={inputCls} inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
          </Field>
          <Field label="Fett g">
            <input className={inputCls} inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} />
          </Field>
        </div>
      ) : (
        <button className="text-sm text-mute underline" onClick={() => setMore(true)}>
          + Makron (valfritt)
        </button>
      )}
      <Button
        className="w-full"
        disabled={!k || k <= 0}
        onClick={async () => {
          const id = await logQuick(k!, text, meal, date, { p: parseNum(p) ?? undefined, c: parseNum(c) ?? undefined, f: parseNum(f) ?? undefined });
          toast(`${kcalStr(k!)} kcal loggade`, () => void deleteLogs([id]));
          onDone();
        }}
      >
        Logga {k ? `${kcalStr(k)} kcal` : ''}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mängd
// ---------------------------------------------------------------------------

const G_CHIPS = [50, 100, 150, 200, 300];
const P_CHIPS = [0.5, 1, 1.5, 2];

function AmountView({
  pick,
  mode,
  meal,
  setMeal,
  date,
  onLogged,
  onPicked,
}: {
  pick: Pick;
  mode: 'log' | 'pick';
  meal: Meal;
  setMeal: (m: Meal) => void;
  date: string;
  onLogged: () => void;
  onPicked: (grams: number) => void;
}) {
  const servingG = pickServingG(pick);
  const canPortion = pick.kind === 'recipe' || !!servingG;
  // Styckvaror (ägg, banan, brödskiva …) räknas i hela; övriga portioner i halvor.
  const unitWord = pickUnit(pick);
  const countable = ['st', 'skiva', 'klyfta', 'filé', 'bit', 'klick', 'låda'].includes(unitWord);
  const pChips = countable ? [1, 2, 3, 4] : P_CHIPS;
  const init = defaultAmount(pick);
  const [unit, setUnit] = useState<Amount['unit']>(init.unit === 'portion' && !canPortion ? 'g' : init.unit);
  const [val, setVal] = useState(num(init.unit === 'portion' && !canPortion ? 100 : init.value, 2));
  const [fav, setFav] = useState(false);
  const [multi, setMulti] = useState(false);
  const [dates, setDates] = useState<string[]>([date]);
  useEffect(() => {
    void isFavorite(pick).then(setFav);
  }, [pick]);

  const value = parseNum(val) ?? 0;
  const amount: Amount = { unit, value };
  const n = value > 0 ? pickNutrients(pick, amount) : null;
  const days = nextDays(date, 7);
  const grams = unit === 'g' ? value : servingG ? value * servingG : 0;

  function switchUnit(u: Amount['unit']) {
    if (u === unit) return;
    if (u === 'g' && servingG) setVal(String(Math.round(value * servingG)));
    else if (u === 'portion' && servingG) setVal(num(Math.round((value / servingG) * 4) / 4, 2));
    else setVal(u === 'g' ? '100' : '1');
    setUnit(u);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-mute">
          {pick.kind === 'recipe'
            ? pick.recipe.batch
              ? `Matlåda · ${num(pick.recipe.batch.left, 1)} av ${pick.recipe.batch.total} kvar · ${servingG} g/låda`
              : `${pick.recipe.portions} portioner · ${servingG} g/portion`
            : [pick.food.brand, servingG ? `1 ${unitWord} ≈ ${servingG} g` : '', `${kcalStr(pick.food.per100.kcal)} kcal/100 g`].filter(Boolean).join(' · ')}
        </div>
        <button
          onClick={async () => setFav(await toggleFavorite(pick))}
          className={`-mt-1 h-10 w-10 shrink-0 rounded-full text-xl ${fav ? 'text-warn' : 'text-mute'}`}
          aria-label={fav ? 'Ta bort favorit' : 'Spara som favorit'}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>

      <div className="flex items-stretch gap-2">
        <input
          className={`${inputCls} flex-1 text-center text-4xl font-black`}
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        {canPortion && (
          <div className="flex w-32 flex-col gap-1 rounded-2xl bg-panel2 p-1">
            {(['portion', 'g'] as const).map((u) => (
              <button key={u} onClick={() => switchUnit(u)} className={`flex-1 rounded-xl text-sm font-semibold ${unit === u ? 'bg-ink text-bg' : 'text-mute'}`}>
                {u === 'g' ? 'gram' : unitText(2, unitWord).replace(/^2 /, '')}
              </button>
            ))}
          </div>
        )}
        {!canPortion && <div className="flex items-center px-2 text-lg text-mute">gram</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {(unit === 'g' ? G_CHIPS : pChips).map((x) => (
          <button key={x} onClick={() => setVal(num(x, 2))} className="min-h-10 flex-1 rounded-xl bg-panel2 px-3 text-sm font-semibold">
            {unit === 'g' ? `${x} g` : countable ? unitText(x, unitWord) : num(x, 1)}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-panel2 p-3 text-center">
        <div className="text-3xl font-black tracking-tight">{n ? kcalStr(n.kcal) : '–'} <span className="text-base font-semibold text-mute">kcal</span></div>
        <div className="text-sm text-mute">{n ? macroStr(n) || 'Makron saknas' : ''}{unit === 'portion' && servingG ? ` · ${num(grams, 0)} g` : ''}</div>
      </div>

      {mode === 'log' ? (
        <>
          <MealPicker value={meal} onChange={setMeal} />
          <div>
            <button onClick={() => setMulti((x) => !x)} className="text-sm text-mute underline">
              {multi ? 'Bara en dag' : 'Logga på flera dagar (matlåda)'}
            </button>
            {multi && (
              <div className="mt-2 grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const on = dates.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => setDates((x) => (on ? x.filter((y) => y !== d) : [...x, d].sort()))}
                      className={`flex min-h-12 flex-col items-center justify-center rounded-xl text-xs font-semibold ${on ? 'bg-accent text-onaccent' : 'bg-panel2 text-mute'}`}
                    >
                      <span>{DAY_SHORT[weekday(d)]}</span>
                      <span className="text-[10px] font-normal">{formatShort(d).split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button
            className="w-full"
            disabled={!n || !dates.length}
            onClick={async () => {
              const use = multi ? dates : [date];
              const ids = await logPick(pick, amount, meal, use);
              toast(use.length > 1 ? `${pickName(pick)} loggad ${use.length} dagar` : `${pickName(pick)} loggad`, () => void deleteLogs(ids));
              onLogged();
            }}
          >
            Logga {n ? `${kcalStr(n.kcal)} kcal` : ''}
            {multi && dates.length > 1 ? ` × ${dates.length} dagar` : ''}
          </Button>
        </>
      ) : (
        <Button className="w-full" disabled={!grams} onClick={() => onPicked(grams)}>
          Lägg till {num(grams, 0)} g
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Egen produkt
// ---------------------------------------------------------------------------

function NewFoodForm({ init, onSaved }: { init: { barcode?: string; name?: string }; onSaved: (f: FoodLike) => void }) {
  const [name, setName] = useState(init.name ?? '');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [serving, setServing] = useState('');
  const k = parseNum(kcal);
  return (
    <div className="space-y-3">
      {init.barcode && (
        <div className="rounded-xl bg-panel2 p-3 text-sm">
          Streckkoden <b>{init.barcode}</b> finns inte i Open Food Facts. Fyll i det som står på förpackningen – nästa gång du skannar den hittas den direkt.
        </div>
      )}
      <Field label="Namn">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="kcal per 100 g">
          <input className={inputCls} inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </Field>
        <Field label="Portion (g, valfritt)">
          <input className={inputCls} inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} />
        </Field>
      </div>
      <div className="text-xs text-mute">Per 100 g, valfritt:</div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Protein">
          <input className={inputCls} inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
        </Field>
        <Field label="Kolhydrater">
          <input className={inputCls} inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
        </Field>
        <Field label="Fett">
          <input className={inputCls} inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} />
        </Field>
      </div>
      <Button
        className="w-full"
        disabled={!name.trim() || k == null}
        onClick={async () => {
          const rec = await createCustomFood({
            name,
            barcode: init.barcode,
            servingG: parseNum(serving) ?? undefined,
            per100: { kcal: k!, p: parseNum(p) ?? undefined, c: parseNum(c) ?? undefined, f: parseNum(f) ?? undefined },
          });
          onSaved(rec);
        }}
      >
        Spara och välj mängd
      </Button>
    </div>
  );
}
