import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CartesianGrid, ComposedChart, Line, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../db/db';
import { useAppSettings } from '../App';
import { saveSettings } from '../db/store';
import { BODY } from '../plan/config';
import { kcalSuggestion, movingAverage, targetKg, weeklyAverages } from '../engine/bodyweight';
import { addDays, diffDays, formatShort } from '../lib/dates';
import { num, parseNum } from '../lib/format';
import { Button, Card, Field, Header, Stat, inputCls } from '../ui/ui';
import { C, ChartBox, LegendItem, axisProps, tooltipProps } from '../ui/charts';
import { useToday } from '../ui/hooks';
import { ask } from '../ui/confirm';

export function BodyScreen() {
  const day = useToday();
  const weighs = useLiveQuery(() => db.weighIns.orderBy('date').toArray(), []);
  const protein = useLiveQuery(() => db.protein.toArray(), []);
  const s = useAppSettings();
  // Loggat protein per dag (från Mat) – dagar över gränsen räknas som "proteinmål nått".
  const foodProtein = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const l of await db.foodLog.where('date').aboveOrEqual(addDays(day, -7)).toArray()) m.set(l.date, (m.get(l.date) ?? 0) + (l.n.p ?? 0));
    return m;
  }, [day]);
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(day);
  if (!weighs || !protein || !foodProtein) return null;
  const proteinOk = (d: string) => protein.some((p) => p.date === d && p.done) || (foodProtein.get(d) ?? 0) >= BODY.proteinMinG;

  const avg = movingAverage(weighs, day);
  const target = targetKg(day);
  const suggest = kcalSuggestion(weighs, day);
  const weeks = weeklyAverages(weighs);
  const lastWeek = weeks[weeks.length - 1];
  const prevWeek = weeks[weeks.length - 2];

  // Graf: från första invägningen till idag + 4 veckor
  const first = weighs[0]?.date ?? BODY.startDate;
  const end = addDays(day, 28);
  const n = Math.max(1, diffDays(end, first));
  const step = Math.max(1, Math.round(n / 120));
  const data: { date: string; label: string; medel?: number | null; mal: number; vikt?: number }[] = [];
  for (let i = 0; i <= n; i += step) {
    const d = addDays(first, i);
    const w = weighs.find((x) => x.date === d);
    data.push({
      date: d,
      label: formatShort(d),
      medel: d <= day ? movingAverage(weighs, d) : undefined,
      mal: Math.round(targetKg(d) * 100) / 100,
      vikt: w?.kg,
    });
  }

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
  const proteinDays = last7.filter(proteinOk).length;
  const todayProtein = protein.find((p) => p.date === day)?.done;

  return (
    <div>
      <Header title="Kropp" sub="Visar 7-dagars glidande medel, inte enskilda dagar" />
      <div className="p-4 space-y-4">
        <Card>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="7-dagarsmedel" value={avg ? `${num(avg)} kg` : '–'} />
            <Stat label="Målkurva idag" value={`${num(target)} kg`} sub={avg ? `${avg >= target ? '+' : ''}${num(avg - target)} kg` : undefined} />
            <Stat label="Veckoförändring" value={lastWeek && prevWeek ? `${lastWeek.avg >= prevWeek.avg ? '+' : ''}${num(lastWeek.avg - prevWeek.avg, 2)}` : '–'} sub="kg mot förra veckan" />
          </div>
        </Card>

        {suggest && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
            Veckomedlet har legat under målkurvan två veckor i rad. {BODY.kcalSuggestion}
            <Button
              kind="soft"
              className="mt-2 w-full"
              onClick={() => void saveSettings({ surplusKcal: s.surplusKcal + BODY.kcalRaise })}
            >
              Höj överskottet i Mat: +{s.surplusKcal} → +{s.surplusKcal + BODY.kcalRaise} kcal
            </Button>
          </div>
        )}

        <Card>
          <div className="grid grid-cols-2 gap-2 items-end">
            <Field label="Vikt (kg)">
              <input className={inputCls} inputMode="decimal" placeholder={weighs.length ? num(weighs[weighs.length - 1].kg) : ''} value={kg} onChange={(e) => setKg(e.target.value)} />
            </Field>
            <Field label="Datum">
              <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Button
              className="col-span-2"
              disabled={parseNum(kg) == null}
              onClick={async () => {
                await db.weighIns.put({ date, kg: parseNum(kg)! });
                setKg('');
              }}
            >
              Spara
            </Button>
          </div>
        </Card>

        <ChartBox
          title="Vikttrend"
          legend={
            <div className="flex gap-3">
              <LegendItem color={C.gym} label="Medel" />
              <LegendItem color={C.ref} label="Mål" dashed />
            </div>
          }
        >
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={30} />
            <YAxis {...axisProps} domain={['dataMin - 0.5', 'dataMax + 0.5']} width={44} tickFormatter={(v) => num(v)} />
            <Tooltip {...tooltipProps} formatter={(v: number, nm: string) => [`${num(v, 2)} kg`, nm === 'medel' ? '7-dagarsmedel' : nm === 'mal' ? 'Mål' : 'Invägning']} />
            <Line dataKey="mal" stroke={C.ref} strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter dataKey="vikt" fill={C.gym} fillOpacity={0.35} shape="circle" isAnimationActive={false} />
            <Line dataKey="medel" stroke={C.gym} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ChartBox>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Protein</div>
              <div className="text-xs text-mute">{BODY.proteinText}</div>
              {(foodProtein.get(day) ?? 0) > 0 && <div className="text-xs text-mute">Loggat i Mat idag: {num(foodProtein.get(day) ?? 0, 0)} g</div>}
              <div className="text-sm mt-1">
                {proteinDays} av 7 dagar senaste veckan
              </div>
            </div>
            <Button kind={todayProtein ? 'primary' : 'soft'} onClick={() => db.protein.put({ date: day, done: !todayProtein })}>
              {todayProtein ? '✓ Idag' : 'Nått idag'}
            </Button>
          </div>
          <div className="mt-3 flex gap-1">
            {last7.map((d) => (
              <div key={d} className={`flex-1 h-2 rounded-full ${proteinOk(d) ? 'bg-accent' : 'bg-panel2'}`} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="font-semibold mb-2">Delmål</div>
          <div className="divide-y divide-line text-sm">
            {BODY.milestones.slice(1).map((m) => (
              <div key={m.date} className="flex justify-between py-2">
                <span>{m.label}</span>
                <span className="text-mute">
                  {num(m.kg)} kg · {formatShort(m.date)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="font-semibold mb-2">Senaste invägningar</div>
          <div className="divide-y divide-line text-sm">
            {[...weighs]
              .reverse()
              .slice(0, 10)
              .map((w) => (
                <div key={w.date} className="flex justify-between py-2">
                  <span>{formatShort(w.date)}</span>
                  <span className="flex items-center gap-3">
                    {num(w.kg)} kg
                    <button className="text-mute text-xs" onClick={async () => (await ask('Ta bort invägningen?', { ok: 'Ta bort', danger: true })) && db.weighIns.delete(w.date)}>
                      ta bort
                    </button>
                  </span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
