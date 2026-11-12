import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppSettings, useNav } from '../App';
import { db } from '../db/db';
import { saveSettings } from '../db/store';
import { PLAN_LENGTH, scheduleWarnings, weekIndexForDate, marathonLayout, type PlannedSession } from '../engine/planGenerator';
import { DAY_NAMES, DAY_SHORT, formatShort } from '../lib/dates';
import { num } from '../lib/format';
import { Badge, Button, Card, Header, ProgressBar, Sheet } from '../ui/ui';
import { SessionCard } from '../ui/session';
import { easyShare, isDone, useToday, useWeekLogs, weekPlan, weekStatus } from '../ui/hooks';
import { RECOVERY } from '../plan/config';

const PHASE_COLOR: Record<string, string> = {
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
    return { gym, runs };
  }, []);

  const weeks = Array.from({ length: last + 1 }, (_, i) => weekPlan(i, settings));
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
          const wl = logs ? { gym: logs.gym.filter((g) => g.weekIndex === w.index), runs: logs.runs.filter((r) => r.weekIndex === w.index) } : undefined;
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
                      {w.repeated && <Badge tone="warn">{w.restart ? 'omstart' : `upprepar v${w.planWeek}`}</Badge>}
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
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right text-xs text-mute shrink-0 w-12">
                    {st.done}/{st.total}
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
              <div className="text-xl font-bold">
                {st.done}/{st.total}
              </div>
            </div>
            <div>
              <div className="text-xs text-mute">Km sprungna / plan</div>
              <div className="text-xl font-bold">
                {num(st.kmDone)} / {w.kmTarget != null ? num(w.kmTarget) : num(w.kmPlanned)}
              </div>
            </div>
            <div>
              <div className="text-xs text-mute">Andel lugnt</div>
              <div className={`text-xl font-bold ${share != null && share < 0.75 ? 'text-warn' : ''}`}>{share != null ? `${Math.round(share * 100)} %` : '–'}</div>
              <div className="text-[10px] text-mute">mål ca 80 % av tiden</div>
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar value={st.kmDone} max={w.kmTarget ?? w.kmPlanned} tone="run" />
          </div>
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
          return (
            <div key={d}>
              <div className="text-sm font-semibold text-mute pt-1 pb-1">
                {DAY_NAMES[d]} {formatShort(addD(w.start, d))}
              </div>
              {ss.length === 0 && <div className="text-sm text-mute pl-1">Vila</div>}
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

        {(unplannedRuns.length > 0 || unplannedGym.length > 0) && (
          <Card>
            <div className="font-semibold mb-1">Övriga pass</div>
            {unplannedGym.map((g) => (
              <div key={g.id} className="text-sm">
                {formatShort(g.date)} · {g.title}
              </div>
            ))}
            {unplannedRuns.map((r) => (
              <div key={r.id} className="text-sm">
                {formatShort(r.date)} · {num(r.distanceKm)} km
              </div>
            ))}
          </Card>
        )}

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
