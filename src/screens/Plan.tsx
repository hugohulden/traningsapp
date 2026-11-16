import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppSettings, useNav } from '../App';
import { db } from '../db/db';
import { saveSettings } from '../db/store';
import { PLAN_LENGTH, scheduleWarnings, weekIndexForDate, marathonLayout, type PlannedSession } from '../engine/planGenerator';
import { DAY_NAMES, DAY_SHORT, formatShort, weekday } from '../lib/dates';
import { formatDuration, formatPace, num } from '../lib/format';
import { RunLogSheet } from '../ui/run';
import type { RunRec, SwimRec } from '../db/db';
import { SwimLogSheet, SwimRow } from '../ui/swim';
import { Badge, Button, Card, Header, ProgressBar, Sheet } from '../ui/ui';
import { SessionCard } from '../ui/session';
import { easyShare, isDone, useToday, useWeekLogs, weekPlan, weekStatus } from '../ui/hooks';
import { RECOVERY, WEEKS_BEFORE_PLAN } from '../plan/config';

const PHASE_COLOR: Record<string, string> = {
  Uppstart: 'bg-slate-400',
  'Fas 1 Bas': 'bg-sky-500',
  'Fas 2 Tröskel': 'bg-violet-500',
  'Fas 3 Specifik': 'bg-orange-500',
  Nedtrappning: 'bg-teal-500',
  Tävling: 'bg-accent',
};

export function PlanScreen() {
  const settings = useAppSettings();
  const nav = useNav();
  const day = useToday();
  const cur = weekIndexForDate(day);
  const L = marathonLayout(settings.marathonDate);
  const last = L ? L.raceIndex : PLAN_LENGTH + RECOVERY.weeks - 1;
  const logs = useLiveQuery(async () => {
    const gym = await db.gymSessions.where('status').equals('done').toArray();
    const runs = await db.runs.toArray();
    const swims = await db.swims.toArray();
    return { gym, runs, swims };
  }, []);

  const weeks = Array.from({ length: last + 1 + WEEKS_BEFORE_PLAN }, (_, i) => weekPlan(i - WEEKS_BEFORE_PLAN, settings));
  let lastPhase = '';

  return (
    <div>
      <Header title="Plan" sub={`Göteborgsvarvet lör 22 maj 2027${settings.marathonDate ? ` · marathon ${formatShort(settings.marathonDate)}` : ''}`} />
      <div className="p-4 space-y-2">
        <div className="flex flex-wrap gap-3 text-xs text-mute pb-1">
          {Object.entries(PHASE_COLOR).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${c}`} />
              {k}
            </span>
          ))}
        </div>
        {weeks.map((w) => {
          const wl = logs ? { gym: logs.gym.filter((g) => g.weekIndex === w.index), runs: logs.runs.filter((r) => r.weekIndex === w.index), swims: logs.swims.filter((x) => x.weekIndex === w.index) } : undefined;
          const st = weekStatus(w, wl);
          const header = w.phaseName !== lastPhase ? w.phaseName : null;
          lastPhase = w.phaseName;
          const isCur = w.index === cur;
          const past = w.index < cur;
          return (
            <div key={w.index}>
              {header && <div className="pt-3 pb-1 text-sm font-semibold text-mute">{header}</div>}
              <button
                onClick={() => nav.push({ name: 'week', index: w.index })}
                className={`w-full rounded-2xl border p-3 text-left active:bg-panel2 ${isCur ? 'border-accent bg-panel' : 'border-line bg-panel'} ${past ? 'opacity-75' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-1.5 rounded-full ${PHASE_COLOR[w.phaseName] ?? 'bg-mute'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{w.label}</span>
                      <span className="text-xs text-mute">{formatShort(w.start)}</span>
                      {w.deload && <Badge tone="warn">D</Badge>}
                      {w.repeated && <Badge tone="warn">{w.restart ? 'omstart' : `upprepar v${(w.planWeek ?? 0) + WEEKS_BEFORE_PLAN}`}</Badge>}
                      {w.def?.quality?.test && <Badge tone="run">TEST</Badge>}
                      {isCur && <Badge tone="accent">nu</Badge>}
                    </div>
                    <div className="text-xs text-mute truncate">
                      {w.kmTarget ? `${num(w.kmTarget)} km` : w.kind === 'plan' ? 'Lopp' : ''}
                      {w.def?.long ? ` · lång ${w.def.long.text}` : ''}
                      {w.def?.quality ? ` · ${w.def.quality.text}` : ''}
                      {w.def?.raceWeek ? 'LOPP lör 22 maj' : ''}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {Array.from({ length: 7 }, (_, d) => {
                        const ss = w.sessions.filter((s) => s.day === d);
                        const noPlan = w.sessions.length === 0;
                        const lg = noPlan && wl ? [...wl.gym.filter((g) => weekday(g.date) === d).map((g) => ({ k: g.id, c: 'bg-accent' })), ...wl.runs.filter((r) => weekday(r.date) === d).map((r) => ({ k: r.id, c: 'bg-run' }))] : [];
                        const sw = (wl?.swims ?? []).filter((x) => weekday(x.date) === d).map((x) => ({ k: x.id, c: 'bg-swim' }));
                        return (
                          <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
                            <div className="text-[9px] text-mute">{DAY_SHORT[d][0]}</div>
                            <div className="flex gap-0.5 h-2">
                              {ss.map((s) => (
                                <span
                                  key={s.key}
                                  className={`h-2 w-2 rounded-full ${isDone(s, wl) ? (s.kind === 'gym' ? 'bg-accent' : 'bg-run') : s.optional ? 'border border-line' : 'bg-line'}`}
                                />
                              ))}
                              {[...lg, ...sw].map((x) => (
                                <span key={x.k} className={`h-2 w-2 rounded-full ${x.c}`} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right text-xs text-mute shrink-0 w-12">
                    {w.sessions.length ? `${st.done}/${st.total}` : `${(wl?.gym.length ?? 0) + (wl?.runs.length ?? 0) + (wl?.swims.length ?? 0)} pass`}
                    <div>{num(st.kmDone)} km</div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeekScreen({ index }: { index: number }) {
  const settings = useAppSettings();
  const nav = useNav();
  const w = weekPlan(index, settings);
  const next = weekPlan(index + 1, settings);
  const logs = useWeekLogs(index);
  const st = weekStatus(w, logs);
  const [moving, setMoving] = useState<PlannedSession | null>(null);
  const [editRun, setEditRun] = useState<RunRec | null>(null);
  const [editSwim, setEditSwim] = useState<SwimRec | null>(null);
  const warnings = scheduleWarnings([...w.sessions, ...next.sessions]).filter((x) => w.sessions.some((s) => x.sessionKeys.includes(s.key)));
  const share = logs ? easyShare(logs.runs) : null;
  const missed = settings.missedWeeks.find((m) => m.index === index);
  const unplannedRuns = (logs?.runs ?? []).filter((r) => !r.plannedKey);
  const unplannedGym = (logs?.gym ?? []).filter((g) => !g.plannedKey);

  return (
    <div className="pb-10">
      <Header title={w.label} onBack={() => nav.pop()} sub={`${w.phaseName}${w.deload ? ' · deload' : ''} · från ${formatShort(w.start)}`} />
      <div className="p-4 space-y-3">
        <Card>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-mute">Pass</div>
              <div className="text-xl font-bold">{w.sessions.length ? `${st.done}/${st.total}` : (logs?.gym.length ?? 0) + (logs?.runs.length ?? 0) + (logs?.swims?.length ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs text-mute">{w.sessions.length ? 'Km sprungna / plan' : 'Km sprungna'}</div>
              <div className="text-xl font-bold">
                {num(st.kmDone)}
                {w.sessions.length ? ` / ${w.kmTarget != null ? num(w.kmTarget) : num(w.kmPlanned)}` : ''}
              </div>
            </div>
            <div>
              <div className="text-xs text-mute">Andel lugnt</div>
              <div className={`text-xl font-bold ${share != null && share < 0.75 ? 'text-warn' : ''}`}>{share != null ? `${Math.round(share * 100)} %` : '–'}</div>
              <div className="text-[10px] text-mute">mål ca 80 % av tiden</div>
            </div>
          </div>
          {w.sessions.length > 0 && (
            <div className="mt-3">
              <ProgressBar value={st.kmDone} max={w.kmTarget ?? w.kmPlanned} tone="run" />
            </div>
          )}
          {w.kmTarget != null && Math.abs(w.kmPlanned - w.kmTarget) >= 1 && (
            <div className="mt-2 text-xs text-mute">
              Planerade pass blir {num(w.kmPlanned)} km (rest under 4 km stryks, lördagspasset högst 8 km).
            </div>
          )}
        </Card>

        {warnings.map((x, i) => (
          <div key={i} className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
            ⚠ {x.text}
          </div>
        ))}

        {Array.from({ length: 7 }, (_, d) => {
          const ss = w.sessions.filter((s) => s.day === d);
          const dGym = unplannedGym.filter((g) => weekday(g.date) === d);
          const dRun = unplannedRuns.filter((r) => weekday(r.date) === d);
          const dSwim = (logs?.swims ?? []).filter((x) => weekday(x.date) === d);
          return (
            <div key={d}>
              <div className="text-sm font-semibold text-mute pt-1 pb-1">
                {DAY_NAMES[d]} {formatShort(addD(w.start, d))}
              </div>
              {ss.length === 0 && dGym.length === 0 && dRun.length === 0 && dSwim.length === 0 && <div className="text-sm text-mute pl-1">Vila</div>}
              <div className="space-y-2">
                {dGym.map((g) => (
                  <button key={g.id} onClick={() => nav.push({ name: 'gym', id: g.id })} className="relative isolate w-full overflow-hidden rounded-2xl border border-line bg-panel px-4 py-3 text-left">
                    <div className="absolute -z-10 inset-y-0 left-0 w-1 bg-accent" />
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Gym</div>
                    <div className="font-semibold">{g.title}</div>
                    <div className="text-xs text-mute">
                      {g.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0)} set · {g.exercises.filter((e) => e.sets.some((x) => x.done)).length} övningar · tryck för att visa
                    </div>
                  </button>
                ))}
                {dSwim.map((x) => (
                  <SwimRow key={x.id} w={x} onClick={() => setEditSwim(x)} />
                ))}
                {dRun.map((r) => (
                  <button key={r.id} onClick={() => setEditRun(r)} className="relative isolate w-full overflow-hidden rounded-2xl border border-line bg-panel px-4 py-3 text-left">
                    <div className="absolute -z-10 inset-y-0 left-0 w-1 bg-run" />
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-run">Löpning</div>
                    <div className="font-semibold">
                      {r.source !== 'manuell' ? '⌚ ' : ''}
                      {r.name || 'Löppass'}
                    </div>
                    <div className="text-xs text-mute">
                      {num(r.distanceKm, 2)} km · {formatDuration(r.durationSec)} · {formatPace(r.durationSec / r.distanceKm)}/km
                      {r.avgHr ? ` · ${r.avgHr} bpm` : ''}
                    </div>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {ss.map((s) => (
                  <div key={s.key}>
                    <SessionCard s={s} done={isDone(s, logs)} settings={settings} compact={false} />
                    <button onClick={() => setMoving(s)} className="mt-1 text-xs text-mute underline underline-offset-2 pl-1">
                      Flytta {s.day !== s.defaultDay ? `(flyttad från ${DAY_NAMES[s.defaultDay].toLowerCase()})` : ''}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {w.kind === 'plan' && index < PLAN_LENGTH - 1 && (
          <Card>
            <div className="font-semibold">Missad vecka?</div>
            <div className="text-sm text-mute mt-1">
              Sjukdom eller resa: veckan upprepas nästa vecka i stället för att hoppa framåt. Loppdatumet flyttas inte, så en vecka i fas 2 stryks.
            </div>
            {missed ? (
              <Button kind="ghost" className="w-full mt-3" onClick={() => saveSettings({ missedWeeks: settings.missedWeeks.filter((m) => m.index !== index) })}>
                Ångra: veckan är inte missad
              </Button>
            ) : (
              <div className="grid grid-cols-1 gap-2 mt-3">
                <Button kind="soft" onClick={() => saveSettings({ missedWeeks: [...settings.missedWeeks, { index, restart: false }] })}>
                  Upprepa veckan nästa vecka
                </Button>
                <Button kind="soft" onClick={() => saveSettings({ missedWeeks: [...settings.missedWeeks, { index, restart: true }] })}>
                  Upprepa på 75 % (7+ dagar utan löpning)
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      {editSwim && <SwimLogSheet open onClose={() => setEditSwim(null)} existing={editSwim} />}
      {editRun && <RunLogSheet open onClose={() => setEditRun(null)} settings={settings} existing={editRun} />}
      <Sheet open={!!moving} onClose={() => setMoving(null)} title={`Flytta: ${moving?.title ?? ''}`}>
        <div className="space-y-2">
          {DAY_NAMES.map((n, d) => (
            <Button
              key={d}
              kind={moving?.day === d ? 'primary' : 'soft'}
              className="w-full"
              onClick={() => {
                const key = `${index}:${moving!.key}`;
                const o = { ...settings.dayOverrides };
                if (d === moving!.defaultDay) delete o[key];
                else o[key] = d;
                void saveSettings({ dayOverrides: o });
                setMoving(null);
              }}
            >
              {n} {formatShort(addD(w.start, d))}
              {moving?.defaultDay === d ? ' (planerad dag)' : ''}
            </Button>
          ))}
          <div className="text-xs text-mute">Du får en varning om ett tungt benpass hamnar inom 48 h före kvalitetspass eller långpass, eller om två hårda löppass hamnar i rad.</div>
        </div>
      </Sheet>
    </div>
  );
}

function addD(d: string, n: number) {
  const [y, m, day] = d.split('-').map(Number);
  const x = new Date(y, m - 1, day + n, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
