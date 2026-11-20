/** Fliken Mat: dagsvy med kalorimål, makron, måltider och senaste 7 dagarna. */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppSettings, useNav } from '../App';
import { db, type FoodLogRec, type Meal } from '../db/db';
import { addDays, DAY_SHORT, formatLong, formatShort, weekday } from '../lib/dates';
import { num, parseNum } from '../lib/format';
import { Button, Card, Field, Header, Sheet, inputCls } from '../ui/ui';
import { C, ChartBox, LegendItem, axisProps, tooltipProps } from '../ui/charts';
import { useToday } from '../ui/hooks';
import { ask } from '../ui/confirm';
import { toast } from '../ui/toast';
import { dayTarget, macroTargets, MEALS, MEAL_NAMES, sumNutrients } from '../food/engine';
import { copyLogs, deleteLogs, restoreLogs, setBurned, updateLog } from '../food/store';
import { AddSheet } from '../food/ui/AddSheet';
import { BatchesView } from '../food/ui/Batches';
import { amountStr, kcalStr, MacroBar, MealPicker, Ring } from '../food/ui/parts';

// Kommer ihåg vald flik och dag när du går in i en rätt och tillbaka.
let lastView: 'dag' | 'lador' = 'dag';
let lastDate: string | null = null;

export function FoodScreen() {
  const s = useAppSettings();
  const nav = useNav();
  const today = useToday();
  const [date, setDateState] = useState(lastDate ?? today);
  const setDate = (d: string) => {
    lastDate = d === today ? null : d;
    setDateState(d);
  };
  const [view, setViewState] = useState(lastView);
  const setView = (v: 'dag' | 'lador') => {
    lastView = v;
    setViewState(v);
  };
  const activeBoxes = useLiveQuery(async () => (await db.recipes.toArray()).filter((r) => r.batch && r.batch.left > 0).length, []);
  const [add, setAdd] = useState<Meal | null>(null);
  const [edit, setEdit] = useState<FoodLogRec | null>(null);
  const [copy, setCopy] = useState<{ meal: Meal | null } | null>(null);

  const logs = useLiveQuery(() => db.foodLog.where('date').equals(date).sortBy('createdAt'), [date]);
  const day = useLiveQuery(() => db.foodDays.get(date), [date]);
  const target = dayTarget(s, day?.burnedKcal);
  const macros = macroTargets(target, s.macroPct);
  const tot = sumNutrients((logs ?? []).map((l) => l.n));
  const left = target - tot.kcal;

  const dayLabel = date === today ? 'Idag' : date === addDays(today, -1) ? 'Igår' : date === addDays(today, 1) ? 'Imorgon' : '';

  return (
    <div>
      <Header
        title="Mat"
        sub={view === 'lador' ? 'Matlådor' : `${dayLabel ? `${dayLabel} · ` : ''}${formatLong(date)}`}
        right={
          <button onClick={() => nav.push({ name: 'recipes' })} className="min-h-10 rounded-xl bg-panel2 px-3 text-sm font-semibold">
            Rätter
          </button>
        }
      />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-panel2 p-1">
          {(['dag', 'lador'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`min-h-11 rounded-xl text-sm font-semibold ${view === v ? 'bg-ink text-bg' : 'text-mute'}`}>
              {v === 'dag' ? 'Dag' : `Matlådor${activeBoxes ? ` (${activeBoxes})` : ''}`}
            </button>
          ))}
        </div>
        {view === 'lador' ? (
          <BatchesView />
        ) : (
          <>
        {/* Dagbläddring */}
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(addDays(date, -1))} className="h-11 w-11 rounded-2xl bg-panel2 text-2xl" aria-label="Föregående dag">
            ‹
          </button>
          <button onClick={() => setDate(today)} className={`min-h-11 flex-1 rounded-2xl text-sm font-semibold ${date === today ? 'bg-panel2 text-mute' : 'bg-accent/15 text-accent'}`}>
            {date === today ? 'Idag' : 'Till idag'}
          </button>
          <button onClick={() => setDate(addDays(date, 1))} className="h-11 w-11 rounded-2xl bg-panel2 text-2xl" aria-label="Nästa dag">
            ›
          </button>
        </div>

        {/* Ring och makron */}
        <div className="ring-grad rounded-3xl p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <SideStat label="Ätit" value={kcalStr(tot.kcal)} />
            <Ring eaten={tot.kcal} target={target}>
              <div className={`text-4xl font-black leading-none tracking-tighter ${left < 0 ? 'text-warn' : 'text-grad'}`}>{kcalStr(Math.abs(left))}</div>
              <div className="mt-1 text-sm font-semibold text-mute">{left < 0 ? 'kcal över' : 'kcal kvar'}</div>
            </Ring>
            <SideStat label="Mål" value={kcalStr(target)} right />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <MacroBar label="Protein" value={tot.p} target={macros.p} color="var(--color-accent)" />
            <MacroBar label="Kolhydrater" value={tot.c} target={macros.c} color="var(--color-run)" />
            <MacroBar label="Fett" value={tot.f} target={macros.f} color="var(--color-swim)" />
          </div>
          <BurnedField date={date} burned={day?.burnedKcal} maintenance={s.maintenanceKcal} surplus={s.surplusKcal} />
        </div>

        {/* Måltider */}
        {MEALS.map((m) => {
          const rows = (logs ?? []).filter((l) => l.meal === m);
          const sum = sumNutrients(rows.map((r) => r.n)).kcal;
          return (
            <Card key={m} className="!p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold tracking-tight">{MEAL_NAMES[m]}</div>
                  <div className="text-sm text-mute">{rows.length ? `${kcalStr(sum)} kcal` : 'Inget loggat'}</div>
                </div>
                {rows.length > 0 && (
                  <button onClick={() => setCopy({ meal: m })} className="h-11 rounded-xl px-3 text-sm text-mute active:bg-panel2" aria-label={`Kopiera ${MEAL_NAMES[m]}`}>
                    Kopiera
                  </button>
                )}
                <button onClick={() => setAdd(m)} className="glow-accent h-12 w-12 rounded-2xl bg-accent text-3xl font-light leading-none text-onaccent" aria-label={`Lägg till i ${MEAL_NAMES[m]}`}>
                  +
                </button>
              </div>
              {rows.length > 0 && (
                <div className="border-t border-line px-4">
                  {rows.map((r) => (
                    <button key={r.id} onClick={() => setEdit(r)} className="flex min-h-12 w-full items-center gap-3 border-b border-line py-2 text-left last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="truncate text-xs text-mute">{r.amount ? amountStr(r.amount, r.servingG, r.unitLabel) : r.ref.kind === 'quick' ? (r.name === 'Snabbkalorier' ? '' : 'snabbkalorier') : ''}</div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold">{kcalStr(r.n.kcal)}</div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        {(logs?.length ?? 0) > 0 && (
          <Button kind="soft" className="w-full" onClick={() => setCopy({ meal: null })}>
            Kopiera hela dagen till…
          </Button>
        )}

        <Last7 date={date} s={s} />
          </>
        )}
      </div>

      <AddSheet open={!!add} onClose={() => setAdd(null)} date={date} meal={add ?? 'frukost'} />
      {edit && <EditLogSheet rec={edit} onClose={() => setEdit(null)} />}
      {copy && <CopySheet from={date} meal={copy.meal} onClose={() => setCopy(null)} />}
    </div>
  );
}

function SideStat({ label, value, right }: { label: string; value: string; right?: boolean }) {
  return (
    <div className={right ? 'text-right' : ''}>
      <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
      <div className="text-[11px] text-mute">kcal</div>
    </div>
  );
}

/** Valfritt: dagens totala förbrukning från Garmin. Målet blir då förbrukning + överskott för den dagen. */
function BurnedField({ date, burned, maintenance, surplus }: { date: string; burned?: number; maintenance: number; surplus: number }) {
  const [val, setVal] = useState(burned ? String(burned) : '');
  useEffect(() => setVal(burned ? String(burned) : ''), [burned, date]);
  const save = () => {
    const v = parseNum(val);
    if ((v ?? null) === (burned ?? null)) return;
    void setBurned(date, v && v > 500 ? v : null);
  };
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
      <div className="min-w-0 flex-1 text-xs text-mute">
        <div className="font-semibold text-ink">Förbrukning från Garmin (valfritt)</div>
        {burned ? `Mål idag: ${kcalStr(burned)} + ${surplus}` : `Tomt = standard ${kcalStr(maintenance)} + ${surplus}`}
      </div>
      <div className="relative w-28 shrink-0">
        <input
          className={`${inputCls} pr-10 text-right text-base`}
          inputMode="numeric"
          placeholder={String(maintenance)}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Dagens förbrukning från Garmin"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mute">kcal</span>
      </div>
    </div>
  );
}

/** Ändra eller ta bort en loggad rad. */
function EditLogSheet({ rec, onClose }: { rec: FoodLogRec; onClose: () => void }) {
  const [meal, setMeal] = useState<Meal>(rec.meal);
  const [date, setDate] = useState(rec.date);
  const [val, setVal] = useState(rec.amount ? num(rec.amount.value, 2) : String(rec.n.kcal));
  const [name, setName] = useState(rec.name);
  const isQuick = !rec.amount;
  const v = parseNum(val) ?? 0;
  // Ändrad mängd skalar näringsvärdena i proportion.
  const k = rec.amount && rec.amount.value > 0 ? v / rec.amount.value : 1;
  const n = isQuick ? { ...rec.n, kcal: Math.round(v) } : { kcal: Math.round(rec.n.kcal * k), p: sc(rec.n.p, k), c: sc(rec.n.c, k), f: sc(rec.n.f, k) };

  return (
    <Sheet open onClose={onClose} title={isQuick ? 'Ändra' : rec.name}>
      <div className="space-y-4">
        {isQuick && (
          <Field label="Beskrivning">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label={isQuick ? 'Kalorier' : rec.amount!.unit === 'g' ? 'Gram' : rec.unitLabel ? `Antal (${rec.unitLabel})` : 'Portioner'}>
          <input className={`${inputCls} text-3xl font-black`} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} onFocus={(e) => e.target.select()} />
        </Field>
        <div className="rounded-2xl bg-panel2 p-3 text-center text-2xl font-black">
          {kcalStr(n.kcal)} <span className="text-base font-semibold text-mute">kcal</span>
        </div>
        <MealPicker value={meal} onChange={setMeal} />
        <Field label="Datum">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button
          className="w-full"
          disabled={v <= 0}
          onClick={async () => {
            await updateLog(rec.id, { meal, date, n, name: isQuick ? name.trim() || 'Snabbkalorier' : rec.name, amount: rec.amount ? { ...rec.amount, value: v } : undefined });
            onClose();
          }}
        >
          Spara
        </Button>
        <Button
          kind="danger"
          className="w-full"
          onClick={async () => {
            await deleteLogs([rec.id]);
            toast(`${rec.name} borttagen`, () => void restoreLogs([rec]));
            onClose();
          }}
        >
          Ta bort
        </Button>
      </div>
    </Sheet>
  );
}

const sc = (x: number | undefined, k: number) => (x == null ? undefined : Math.round(x * k * 10) / 10);

/** Kopiera en måltid eller hela dagen till en annan dag. */
function CopySheet({ from, meal, onClose }: { from: string; meal: Meal | null; onClose: () => void }) {
  const [to, setTo] = useState(addDays(from, 1));
  const [toMeal, setToMeal] = useState<Meal>(meal ?? 'frukost');
  const quick = [-1, 1, 2, 3].map((d) => addDays(from, d));
  return (
    <Sheet open onClose={onClose} title={meal ? `Kopiera ${MEAL_NAMES[meal].toLowerCase()}` : 'Kopiera hela dagen'}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {quick.map((d) => (
            <button key={d} onClick={() => setTo(d)} className={`min-h-12 rounded-xl text-sm font-semibold ${to === d ? 'bg-ink text-bg' : 'bg-panel2 text-mute'}`}>
              {DAY_SHORT[weekday(d)]} {formatShort(d).split(' ')[0]}
            </button>
          ))}
        </div>
        <Field label="Eller välj datum">
          <input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {meal && (
          <div>
            <div className="mb-1 text-sm text-mute">Till måltid</div>
            <MealPicker value={toMeal} onChange={setToMeal} />
          </div>
        )}
        <Button
          className="w-full"
          disabled={!to || to === from}
          onClick={async () => {
            const has = await db.foodLog.where('date').equals(to).count();
            if (!meal && has && !(await ask(`${formatLong(to)} har redan ${has} rader. Lägga till ändå?`, { ok: 'Lägg till' }))) return;
            const n = await copyLogs(from, to, meal, meal ? toMeal : undefined);
            toast(`${n} rader kopierade till ${formatLong(to)}`);
            onClose();
          }}
        >
          Kopiera till {to ? formatLong(to) : '…'}
        </Button>
      </div>
    </Sheet>
  );
}

/** Senaste 7 dagarna mot målet (slutar på vald dag). */
function Last7({ date, s }: { date: string; s: ReturnType<typeof useAppSettings> }) {
  const from = addDays(date, -6);
  const data = useLiveQuery(async () => {
    const logs = await db.foodLog.where('date').between(from, date, true, true).toArray();
    const days = await db.foodDays.where('date').between(from, date, true, true).toArray();
    return { logs, days };
  }, [from, date]);
  const rows = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      const eaten = Math.round(sumNutrients(data.logs.filter((l) => l.date === d).map((l) => l.n)).kcal);
      return { d: `${DAY_SHORT[weekday(d)]} ${formatShort(d).split(' ')[0]}`, ätit: eaten, mål: dayTarget(s, data.days.find((x) => x.date === d)?.burnedKcal) };
    });
  }, [data, from, s]);
  const logged = rows.filter((r) => r.ätit > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, r) => a + r.ätit, 0) / logged.length) : 0;
  const avgTarget = logged.length ? Math.round(logged.reduce((a, r) => a + r.mål, 0) / logged.length) : 0;
  return (
    <div className="space-y-2">
      <ChartBox
        title="Senaste 7 dagarna"
        legend={
          <div className="flex gap-3">
            <LegendItem color={C.gym} label="Ätit" />
            <LegendItem color={C.ref} label="Mål" dashed />
          </div>
        }
      >
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="d" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
          <YAxis {...axisProps} width={44} />
          <Tooltip {...tooltipProps} formatter={(v, k) => [`${kcalStr(Number(v))} kcal`, String(k)]} />
          <Bar dataKey="ätit" fill={C.gym} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
          <Line type="step" dataKey="mål" stroke={C.ref} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartBox>
      {logged.length > 0 && (
        <div className="px-1 text-sm text-mute">
          Snitt {kcalStr(avg)} kcal på {logged.length} loggade {logged.length === 1 ? 'dag' : 'dagar'} · mål {kcalStr(avgTarget)} ·{' '}
          <span className={avg >= avgTarget ? 'text-accent' : 'text-warn'}>
            {avg >= avgTarget ? '+' : '−'}
            {kcalStr(Math.abs(avg - avgTarget))}
          </span>
        </div>
      )}
    </div>
  );
}
