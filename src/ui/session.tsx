import { useState } from 'react';
import type { PlannedSession } from '../engine/planGenerator';
import type { AppSettings } from '../plan/settings';
import { Badge, Button, Card } from './ui';
import { RunLogSheet } from './run';
import { RunGuideView } from './runGuide';
import { startGymSession, useActiveGymSession } from '../db/store';
import { useNav } from '../App';
import { DAY_NAMES, formatShort } from '../lib/dates';
import { resolveSlots, getExercise } from '../engine/gymPlan';
import { formatDuration, formatPace, num } from '../lib/format';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { weekIndexForDate } from '../engine/planGenerator';

export function SessionCard({
  s,
  done,
  settings,
  showDate,
  compact,
}: {
  s: PlannedSession;
  done: boolean;
  settings: AppSettings;
  showDate?: boolean;
  compact?: boolean;
}) {
  const nav = useNav();
  const active = useActiveGymSession();
  const [logOpen, setLogOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const loggedGym = useLiveQuery(
    () => (s.kind === 'gym' ? db.gymSessions.where('weekIndex').equals(weekIndexForDate(s.date)).filter((g) => g.plannedKey === s.key && g.status === 'done').first() : undefined),
    [s.date, s.key, s.kind],
  );
  const logged = useLiveQuery(
    () => (s.kind === 'run' ? db.runs.where('weekIndex').equals(weekIndexForDate(s.date)).filter((r) => r.plannedKey === s.key).first() : undefined),
    [s.date, s.key, s.kind],
  );
  const isGym = s.kind === 'gym';

  async function start() {
    if (active) return nav.push({ name: 'gym', id: active.id });
    const id = await startGymSession(s.gym!, s.date, s.key);
    nav.push({ name: 'gym', id });
  }

  const slots = isGym ? resolveSlots(s.gym!, settings) : [];

  return (
    <Card className={done ? 'opacity-70' : ''}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${isGym ? 'bg-accent' : 'bg-run'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">{s.title}</div>
            {s.optional && <Badge>valfritt</Badge>}
            {s.gym?.deload && <Badge tone="warn">deload</Badge>}
            {done && <Badge tone="accent">✓ klart</Badge>}
          </div>
          {showDate && <div className="text-xs text-mute">{DAY_NAMES[s.day]} {formatShort(s.date)}</div>}
          {s.run && (
            <>
              <div className="mt-1 text-2xl font-bold">{num(s.run.km)} km</div>
              <div className="text-sm">{s.run.text}</div>
              {!compact && <RunGuideView run={s.run} settings={settings} />}
            </>
          )}
          {isGym && (
            <button className="mt-1 text-sm text-mute underline-offset-2 underline" onClick={() => setShowList((x) => !x)}>
              {slots.length} övningar{s.gym?.deload ? ' · ett set färre, RIR 3–4' : ''}
            </button>
          )}
          {isGym && showList && (
            <ul className="mt-2 space-y-1 text-sm">
              {slots.map((sl) => (
                <li key={sl.slotId} className="flex justify-between gap-2">
                  <span>{getExercise(settings.slotChoice[sl.slotId] ?? sl.baseExerciseId)?.name ?? getExercise(sl.baseExerciseId)!.name}</span>
                  <span className="text-mute shrink-0">
                    {s.gym?.deload ? Math.max(1, sl.prescription.sets - 1) : sl.prescription.sets} × {sl.prescription.repMin}
                    {sl.prescription.repMax !== sl.prescription.repMin ? `–${sl.prescription.repMax}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {loggedGym && (
        <button onClick={() => nav.push({ name: 'gym', id: loggedGym.id })} className="mt-3 w-full rounded-xl bg-panel2 px-3 py-2 text-left text-sm">
          <div>
            {loggedGym.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0)} set · {loggedGym.exercises.filter((e) => e.sets.some((x) => x.done)).length} övningar
          </div>
          <div className="text-xs text-mute">Tryck för att visa eller ändra</div>
        </button>
      )}
      {logged && (
        <button onClick={() => setEditOpen(true)} className={`mt-3 w-full rounded-xl px-3 py-2 text-left text-sm ${logged.needsTestTime ? 'bg-warn/15 text-warn' : 'bg-panel2'}`}>
          <div>
            {logged.source === 'intervals' ? '⌚ ' : ''}
            {num(logged.distanceKm, 2)} km · {formatDuration(logged.durationSec)} · {formatPace(logged.durationSec / logged.distanceKm)}/km
            {logged.avgHr ? ` · ${logged.avgHr} bpm` : ''}
          </div>
          <div className="text-xs text-mute">{logged.needsTestTime ? 'Tryck och fyll i testtiden' : 'Tryck för att ändra'}</div>
        </button>
      )}
      {!compact && !done && (
        <div className="mt-3">
          {isGym ? (
            <Button className="w-full" onClick={start}>
              {active ? 'Fortsätt pågående pass' : 'Starta pass'}
            </Button>
          ) : (
            <Button kind="run" className="w-full" onClick={() => setLogOpen(true)}>
              Logga
            </Button>
          )}
        </div>
      )}
      {s.run && <RunLogSheet open={logOpen} onClose={() => setLogOpen(false)} planned={s} settings={settings} />}
      {s.run && logged && <RunLogSheet open={editOpen} onClose={() => setEditOpen(false)} planned={s} settings={settings} existing={logged} />}
    </Card>
  );
}
