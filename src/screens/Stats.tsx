import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppSettings } from '../App';
import { db } from '../db/db';
import { doneSets, historyFromSessions, exerciseName } from '../db/store';
import { getExercise } from '../engine/gymPlan';
import { epley, bestSet, workWeight } from '../engine/progression';
import { hmPrediction, paceOf } from '../engine/running';
import { PLAN_LENGTH, weekIndexForDate } from '../engine/planGenerator';
import { RUN_DEFAULTS } from '../plan/config';
import { formatShort, mondayOf } from '../lib/dates';
import { formatDuration, formatPace, num } from '../lib/format';
import { Card, Header, Segmented, Stat, inputCls } from '../ui/ui';
import { C, ChartBox, LegendItem, axisProps, tooltipProps } from '../ui/charts';
import { useToday, weekPlan } from '../ui/hooks';
import type { MuscleGroup } from '../plan/types';

export function StatsScreen() {
  const [tab, setTab] = useState<'gym' | 'run'>('gym');
  return (
    <div>
      <Header title="Statistik" />
      <div className="p-4 space-y-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'gym', label: 'Gym' }, { value: 'run', label: 'Löpning' }]} />
        {tab === 'gym' ? <GymStats /> : <RunStats />}
      </div>
    </div>
  );
}

function GymStats() {
  const sessions = useLiveQuery(() => db.gymSessions.where('status').equals('done').toArray(), []);
  const bodyKg = useLiveQuery(async () => (await db.weighIns.orderBy('date').last())?.kg ?? 73.5, []) ?? 73.5;
  const hist = useMemo(() => historyFromSessions(sessions ?? []), [sessions]);
  const ids = [...hist.keys()].sort((a, b) => exerciseName(a).localeCompare(exerciseName(b), 'sv'));
  const [sel, setSel] = useState<string>('');
  const [metric, setMetric] = useState<'vikt' | 'e1rm' | 'volym'>('e1rm');
  const day = useToday();
  const exId = sel || ids.find((x) => x === 'knaboj') || ids[0];
  const ex = exId ? getExercise(exId) : undefined;
  const extra = ex?.bodyweight ? bodyKg : 0;

  const data = (exId ? hist.get(exId) ?? [] : []).map((h) => {
    const b = bestSet(h.sets, extra);
    return {
      date: formatShort(h.date),
      vikt: workWeight(h.sets),
      e1rm: b ? Math.round(b.e1rm * 10) / 10 : 0,
      volym: Math.round(h.sets.reduce((a, s) => a + (s.weight + extra) * s.reps, 0)),
      mode: h.mode,
    };
  });

  // Set per muskelgrupp och vecka (senaste 4 veckorna)
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const m = mondayOf(day);
    const [y, mo, d] = m.split('-').map(Number);
    const x = new Date(y, mo - 1, d - 7 * (3 - i), 12);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  });
  const groups = new Map<MuscleGroup, number[]>();
  for (const s of sessions ?? []) {
    const wi = weeks.indexOf(mondayOf(s.date));
    if (wi < 0) continue;
    for (const e of s.exercises) {
      const g = getExercise(e.exerciseId)?.muscleGroup;
      if (!g) continue;
      const arr = groups.get(g) ?? [0, 0, 0, 0];
      arr[wi] += doneSets(e).length;
      groups.set(g, arr);
    }
  }

  // Personbästa
  const prs = ids
    .map((id) => {
      const e = getExercise(id);
      const ext = e?.bodyweight ? bodyKg : 0;
      let best: { e1rm: number; w: number; r: number; date: string } | null = null;
      for (const h of hist.get(id) ?? [])
        for (const s of h.sets) {
          const v = epley(s.weight + ext, s.reps);
          if (!best || v > best.e1rm) best = { e1rm: v, w: s.weight, r: s.reps, date: h.date };
        }
      return best ? { id, ...best } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  if (!sessions) return null;
  if (!ids.length) return <Card>Logga ditt första gympass så dyker graferna upp här.</Card>;

  const metricLabel = { vikt: 'Bästa setets vikt (kg)', e1rm: 'Estimerad 1RM (kg)', volym: 'Total volym (kg)' }[metric];

  return (
    <>
      <select className={inputCls} value={exId} onChange={(e) => setSel(e.target.value)}>
        {ids.map((id) => (
          <option key={id} value={id}>
            {exerciseName(id)}
          </option>
        ))}
      </select>
      <Segmented value={metric} onChange={setMetric} options={[{ value: 'e1rm', label: 'e1RM' }, { value: 'vikt', label: 'Vikt' }, { value: 'volym', label: 'Volym' }]} />
      <ChartBox title={metricLabel}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} minTickGap={20} />
          <YAxis {...axisProps} domain={['auto', 'auto']} width={44} />
          <Tooltip {...tooltipProps} formatter={(v: number) => [`${num(v)} kg`, metricLabel]} />
          <Line type="monotone" dataKey={metric} stroke={C.gym} strokeWidth={2} dot={{ r: 4, fill: C.gym, stroke: '#141a22', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </LineChart>
      </ChartBox>

      <Card>
        <div className="font-semibold mb-2">Set per muskelgrupp och vecka</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-mute text-xs">
              <th className="text-left font-normal">Muskelgrupp</th>
              {weeks.map((w) => (
                <th key={w} className="text-right font-normal">
                  {formatShort(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([g, arr]) => (
              <tr key={g} className="border-t border-line">
                <td className="py-1.5">{g}</td>
                {arr.map((n, i) => (
                  <td key={i} className={`text-right ${i === 3 ? 'font-bold' : ''}`}>
                    {n || '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {groups.size === 0 && <div className="text-sm text-mute">Inga set de senaste fyra veckorna.</div>}
      </Card>

      <Card>
        <div className="font-semibold mb-2">Personbästa (estimerad 1RM)</div>
        <div className="divide-y divide-line">
          {prs
            .sort((a, b) => b.e1rm - a.e1rm)
            .map((p) => (
              <div key={p.id} className="flex justify-between py-2 text-sm">
                <span className="min-w-0 truncate pr-2">{exerciseName(p.id)}</span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold">{num(p.e1rm)} kg</span>
                  <span className="text-mute">
                    {' '}
                    · {num(p.w, 2)}×{p.r} · {formatShort(p.date)}
                  </span>
                </span>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}

function RunStats() {
  const settings = useAppSettings();
  const runs = useLiveQuery(() => db.runs.orderBy('date').toArray(), []);
  const thresholds = useLiveQuery(() => db.thresholds.orderBy('date').toArray(), []);
  const day = useToday();
  if (!runs || !thresholds) return null;

  const weekly = Array.from({ length: PLAN_LENGTH }, (_, i) => {
    const w = weekPlan(i, settings);
    const km = runs.filter((r) => r.weekIndex === i).reduce((a, r) => a + r.distanceKm, 0);
    return { v: `v${i + 1}`, sprunget: Math.round(km * 10) / 10, plan: w.kmTarget ?? Math.round(w.kmPlanned) };
  });
  const longest = runs.reduce<(typeof runs)[number] | null>((a, r) => (!a || r.distanceKm > a.distanceKm ? r : a), null);
  const total = runs.reduce((a, r) => a + r.distanceKm, 0);

  const easy = runs
    .filter((r) => r.avgHr && r.avgHr < RUN_DEFAULTS.easyHrMax && r.distanceKm >= 3)
    .map((r) => ({ date: formatShort(r.date), tempo: Math.round(paceOf(r.distanceKm, r.durationSec) ?? 0), puls: r.avgHr }));

  const tData = thresholds.map((t) => ({ date: formatShort(t.date), T: t.thresholdSec }));

  const tests = runs.filter((r) => r.test === '5k' || r.test === '10k');
  const progn = tests.map((r) => ({ date: formatShort(r.date), prognos: Math.round(hmPrediction(r.test as '5k' | '10k', r.durationSec)) }));
  const latest = progn[progn.length - 1];

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <Stat label="Totalt" value={`${num(total, 0)} km`} sub={`${runs.length} pass`} />
        </Card>
        <Card className="p-3">
          <Stat label="Längsta pass" value={longest ? `${num(longest.distanceKm)} km` : '–'} sub={longest ? formatShort(longest.date) : undefined} />
        </Card>
        <Card className="p-3">
          <Stat label="Tröskel T" value={formatPace(settings.thresholdSec)} sub="min/km" />
        </Card>
      </div>

      <ChartBox
        title="Km per vecka mot plan"
        legend={
          <div className="flex gap-3">
            <LegendItem color={C.run} label="Sprunget" />
            <LegendItem color={C.ref} label="Plan" dashed />
          </div>
        }
      >
        <ComposedChart data={weekly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="v" {...axisProps} interval={3} />
          <YAxis {...axisProps} width={40} />
          <Tooltip {...tooltipProps} formatter={(v: number, n: string) => [`${num(v)} km`, n === 'sprunget' ? 'Sprunget' : 'Plan']} />
          <Bar dataKey="sprunget" fill={C.run} radius={[4, 4, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="plan" stroke={C.ref} strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartBox>

      <Card>
        <div className="font-semibold">Halvmaraprognos</div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="Prognos" value={latest ? formatDuration(latest.prognos) : '–'} sub={latest ? `från test ${latest.date}` : 'efter första testet'} />
          <Stat label="Mål" value="1:35:00" sub="4:30/km" />
          <Stat label="Drömmål" value="1:30:00" sub="4:16/km" />
        </div>
        {latest && (
          <div className="mt-2 text-sm">
            {latest.prognos <= 5400 ? '🎯 Prognosen klarar drömmålet.' : latest.prognos <= 5700 ? '✓ Prognosen klarar målet 1:35.' : `${formatDuration(latest.prognos - 5700)} från målet 1:35.`}
          </div>
        )}
        {!latest && <div className="mt-2 text-xs text-mute">Prognosen räknas fram från testloppen (5 km v8, 10 km v16): 10 km-tid × 2,2065 eller 5 km-tid × 4,600.</div>}
      </Card>

      {progn.length > 0 && (
        <ChartBox title="Prognos mot målen" legend={<LegendItem color={C.ref} label="1:35 / 1:30" dashed />}>
          <LineChart data={progn} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" {...axisProps} />
            <YAxis {...axisProps} reversed domain={[5200, 6000]} tickFormatter={(v) => formatDuration(v)} width={56} />
            <Tooltip {...tooltipProps} formatter={(v: number) => [formatDuration(v), 'Prognos']} />
            <ReferenceLine y={5700} stroke={C.ref} strokeDasharray="4 3" label={{ value: '1:35', fill: C.axis, fontSize: 11, position: 'insideTopRight' }} />
            <ReferenceLine y={5400} stroke={C.ref} strokeDasharray="4 3" label={{ value: '1:30', fill: C.axis, fontSize: 11, position: 'insideTopRight' }} />
            <Line dataKey="prognos" stroke={C.run} strokeWidth={2} dot={{ r: 4, fill: C.run, stroke: '#141a22', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ChartBox>
      )}

      <ChartBox title={`Tempo vid lugn puls (under ${RUN_DEFAULTS.easyHrMax})`} empty={easy.length === 0}>
        <LineChart data={easy} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} minTickGap={20} />
          <YAxis {...axisProps} reversed domain={['auto', 'auto']} tickFormatter={(v) => formatPace(v)} width={44} />
          <Tooltip {...tooltipProps} formatter={(v: number, n: string) => (n === 'tempo' ? [`${formatPace(v)}/km`, 'Tempo'] : [v, 'Puls'])} />
          <Line dataKey="tempo" stroke={C.run} strokeWidth={2} dot={{ r: 4, fill: C.run, stroke: '#141a22', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ChartBox>

      <ChartBox title="Tröskelfart över tid">
        <LineChart data={tData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} reversed domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={(v) => formatPace(v)} width={44} />
          <Tooltip {...tooltipProps} formatter={(v: number) => [`${formatPace(v)}/km`, 'T']} />
          <Line type="stepAfter" dataKey="T" stroke={C.run} strokeWidth={2} dot={{ r: 4, fill: C.run, stroke: '#141a22', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ChartBox>

      <Card>
        <div className="font-semibold mb-2">Senaste löppass</div>
        <div className="divide-y divide-line">
          {[...runs]
            .reverse()
            .slice(0, 15)
            .map((r) => (
              <div key={r.id} className="flex justify-between py-2 text-sm">
                <span>
                  {formatShort(r.date)} · {num(r.distanceKm)} km
                  {r.test ? ' · test' : ''}
                </span>
                <span className="text-mute">
                  {formatDuration(r.durationSec)} · {formatPace(paceOf(r.distanceKm, r.durationSec))}/km{r.avgHr ? ` · ${r.avgHr} bpm` : ''}
                </span>
              </div>
            ))}
        </div>
        {runs.length === 0 && <div className="text-sm text-mute">Inga löppass loggade än.</div>}
        <div className="text-[11px] text-mute mt-2">Vecka {Math.max(1, weekIndexForDate(day) + 1)} av {PLAN_LENGTH}</div>
      </Card>
    </>
  );
}
