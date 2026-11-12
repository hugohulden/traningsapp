import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppSettings, useNav } from '../App';
import { db } from '../db/db';
import { allHistory, saveSettings, startGymSession, useActiveGymSession } from '../db/store';
import { weekIndexForDate, weeksToRace, PLAN_LENGTH, type PlannedSession } from '../engine/planGenerator';
import { BACKUP_REMINDER_DAYS, BODY, GENERATOR, GYM_TEMPLATES, PLAN_START, RACE_NAME } from '../plan/config';
import { diffDays, formatLong, formatShort, DAY_NAMES } from '../lib/dates';
import { num } from '../lib/format';
import { Badge, Button, Card, Header, ProgressBar, Sheet, Stat } from '../ui/ui';
import { SessionCard } from '../ui/session';
import { isDone, useToday, useWeekLogs, weekPlan, weekStatus } from '../ui/hooks';
import { RunLogSheet } from '../ui/run';
import { movingAverage } from '../engine/bodyweight';
import { volumeSuggestion, type HistoryEntry } from '../engine/progression';
import { getExercise } from '../engine/gymPlan';
import type { GymTemplateId, MuscleGroup } from '../plan/types';
import { exportBackupFile } from './Settings';

export function TodayScreen() {
  const settings = useAppSettings();
  const nav = useNav();
  const day = useToday();
  const idx = weekIndexForDate(day);
  const week = weekPlan(idx, settings);
  const logs = useWeekLogs(idx);
  const status = weekStatus(week, logs);
  const active = useActiveGymSession();
  const todays = week.sessions.filter((s) => s.date === day);
  const next = nextSession(idx, day, settings, logs ? (s) => isDone(s, logs) : () => false);
  const [freeRun, setFreeRun] = useState(false);
  const [freeGym, setFreeGym] = useState(false);

  return (
    <div>
      <Header
        title="Idag"
        sub={
          <span>
            {formatLong(day)} · {week.kind === 'plan' ? `${week.label} av ${PLAN_LENGTH}` : week.label}
          </span>
        }
      />
      <div className="space-y-4 p-4">
        <TopStats idx={idx} day={day} status={status} weekKm={week.kmTarget} phase={week.phaseName} deload={week.deload} repeated={week.repeated} restart={week.restart} />

        {active && (
          <Card onClick={() => nav.push({ name: 'gym', id: active.id })} className="border-accent/60">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Pågående pass</div>
                <div className="text-sm text-mute">{active.title} · startat {formatShort(active.date)}</div>
              </div>
              <span className="text-accent font-semibold">Fortsätt ›</span>
            </div>
          </Card>
        )}

        <BackupReminder />
        <RestartPrompt idx={idx} day={day} />
        <VolumePrompt idx={idx} phase={week.phase} />

        {week.kind === 'fore' && (
          <Card>
            <div className="font-semibold">Planen startar måndag {formatShort(PLAN_START)}</div>
            <div className="text-sm text-mute mt-1">Fram till dess kan du köra valfria pass nedan för att kalibrera vikterna.</div>
          </Card>
        )}

        {todays.length > 0 ? (
          todays.map((s) => <SessionCard key={s.key} s={s} done={isDone(s, logs)} settings={settings} />)
        ) : week.kind !== 'fore' ? (
          <Card>
            <div className="font-semibold">Vilodag</div>
            {next && (
              <div className="text-sm text-mute mt-1">
                Nästa: {next.title} {DAY_NAMES[next.day].toLowerCase()} {formatShort(next.date)}
              </div>
            )}
          </Card>
        ) : null}

        <QuickBody day={day} />

        <div className="grid grid-cols-2 gap-3">
          <Button kind="soft" onClick={() => setFreeGym(true)}>
            + Valfritt gympass
          </Button>
          <Button kind="soft" onClick={() => setFreeRun(true)}>
            + Annat löppass
          </Button>
        </div>
      </div>
      <RunLogSheet open={freeRun} onClose={() => setFreeRun(false)} settings={settings} />
      <Sheet open={freeGym} onClose={() => setFreeGym(false)} title="Starta gympass">
        <div className="space-y-2">
          {(Object.keys(GYM_TEMPLATES) as GymTemplateId[]).map((t) => (
            <Button
              key={t}
              kind="soft"
              className="w-full text-left"
              onClick={async () => {
                if (active) return nav.push({ name: 'gym', id: active.id });
                const planned = week.sessions.find((s) => s.gym?.template === t && !isDone(s, logs));
                const spec = planned?.gym ?? { template: t, deload: week.deload, variant: 'normal' as const };
                const id = await startGymSession(spec, day, planned?.key ?? null);
                setFreeGym(false);
                nav.push({ name: 'gym', id });
              }}
            >
              {GYM_TEMPLATES[t].name}
              {week.sessions.find((s) => s.gym?.template === t && !isDone(s, logs)) ? ' (veckans pass)' : ''}
            </Button>
          ))}
          <div className="text-xs text-mute pt-1">Om veckans pass inte är gjort räknas det som det planerade passet, även om du kör det en annan dag.</div>
        </div>
      </Sheet>
    </div>
  );
}

function nextSession(idx: number, day: string, settings: ReturnType<typeof useAppSettings>, done: (s: PlannedSession) => boolean): PlannedSession | null {
  for (let i = idx; i < idx + 3; i++) {
    const w = weekPlan(i, settings);
    const s = w.sessions.find((x) => x.date > day && !x.optional && (i !== idx || !done(x)));
    if (s) return s;
  }
  return null;
}

function TopStats(p: {
  idx: number;
  day: string;
  status: { done: number; total: number; kmDone: number };
  weekKm: number | null;
  phase: string;
  deload: boolean;
  repeated?: boolean;
  restart?: boolean;
}) {
  const weeks = weeksToRace(p.day);
  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-3">
        <Badge tone="run">{p.phase}</Badge>
        {p.deload && <Badge tone="warn">Deloadvecka</Badge>}
        {p.repeated && <Badge tone="warn">{p.restart ? 'Omstart 75 %' : 'Upprepad vecka'}</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pass i veckan" value={`${p.status.done} av ${p.status.total || 6}`} />
        <Stat label="Km i veckan" value={`${num(p.status.kmDone)}${p.weekKm ? ` / ${num(p.weekKm)}` : ''}`} />
        <Stat label={`Till ${RACE_NAME}`} value={weeks > 0 ? `${weeks} v` : 'Loppvecka'} sub={weeks > 0 ? `${diffDays('2027-05-22', p.day)} dagar` : undefined} />
      </div>
      <div className="mt-3">
        <ProgressBar value={p.status.done} max={p.status.total || 6} />
      </div>
    </Card>
  );
}

function BackupReminder() {
  const s = useAppSettings();
  const ref = s.lastBackupAt ?? s.firstUseAt;
  if (!ref) return null;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  if (days < BACKUP_REMINDER_DAYS) return null;
  return (
    <Card className="border-warn/50">
      <div className="font-semibold text-warn">Dags för backup</div>
      <div className="text-sm text-mute mt-1">
        {s.lastBackupAt ? `Senaste backup för ${days} dagar sedan.` : 'Du har inte gjort någon backup än.'} All data finns bara i telefonen.
      </div>
      <Button kind="soft" className="mt-3 w-full" onClick={exportBackupFile}>
        Exportera backup nu
      </Button>
    </Card>
  );
}

function RestartPrompt({ idx, day }: { idx: number; day: string }) {
  const s = useAppSettings();
  const lastRun = useLiveQuery(() => db.runs.orderBy('date').last(), []);
  if (idx < 1 || idx >= PLAN_LENGTH - 1 || !lastRun) return null;
  const days = diffDays(day, lastRun.date);
  if (days < GENERATOR.restartAfterDays) return null;
  if (s.restartDismissedWeek === idx) return null;
  if (s.missedWeeks.some((m) => m.index === idx - 1)) return null;
  return (
    <Card className="border-warn/50">
      <div className="font-semibold text-warn">{days} dagar utan löpning</div>
      <div className="text-sm text-mute mt-1">
        Förslag: upprepa förra veckans plan på 75 % av veckomålet. Loppdatumet ligger kvar och fas 2 kortas i stället.
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button kind="primary" onClick={() => saveSettings({ missedWeeks: [...s.missedWeeks, { index: idx - 1, restart: true }] })}>
          Starta om
        </Button>
        <Button kind="ghost" onClick={() => saveSettings({ restartDismissedWeek: idx })}>
          Inte nu
        </Button>
      </div>
    </Card>
  );
}

function VolumePrompt({ idx, phase }: { idx: number; phase: number | null }) {
  const s = useAppSettings();
  const sug = useLiveQuery(async () => {
    if (!phase || phase > 2) return null;
    const hist = await allHistory();
    const groups = new Map<MuscleGroup, { slotId: string; exerciseId: string; sets: number }[]>();
    for (const t of Object.values(GYM_TEMPLATES))
      for (const sl of t.slots) {
        if (sl.optional) continue;
        const ex = getExercise(sl.exerciseId)!;
        const list = groups.get(ex.muscleGroup) ?? [];
        list.push({ slotId: sl.slotId, exerciseId: sl.exerciseId, sets: sl.sets + (s.extraSets[sl.slotId] ?? 0) });
        groups.set(ex.muscleGroup, list);
      }
    for (const [group, cands] of groups) {
      const v = volumeSuggestion(cands, (id) => (hist.get(id) ?? []) as HistoryEntry[]);
      if (v && !s.dismissedSuggestions.includes(`${v.slotId}:${idx}`)) return { ...v, group };
    }
    return null;
  }, [idx, phase, s.extraSets, s.dismissedSuggestions]);
  if (!sug) return null;
  const name = getExercise(sug.exerciseId)!.name;
  return (
    <Card className="border-accent/40">
      <div className="font-semibold">Förslag: mer volym för {sug.group.toLowerCase()}</div>
      <div className="text-sm text-mute mt-1">
        Alla övningar för {sug.group.toLowerCase()} har ökat tre veckor i rad. Lägg till ett set på {name} ({sug.from} → {sug.to} set)?
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button onClick={() => saveSettings({ extraSets: { ...s.extraSets, [sug.slotId]: (s.extraSets[sug.slotId] ?? 0) + 1 } })}>Godkänn</Button>
        <Button kind="ghost" onClick={() => saveSettings({ dismissedSuggestions: [...s.dismissedSuggestions, `${sug.slotId}:${idx}`] })}>
          Nej tack
        </Button>
      </div>
    </Card>
  );
}

function QuickBody({ day }: { day: string }) {
  const weighs = useLiveQuery(() => db.weighIns.toArray(), []);
  const protein = useLiveQuery(() => db.protein.get(day), [day]);
  const todayW = weighs?.find((w) => w.date === day);
  const last = weighs?.length ? [...weighs].sort((a, b) => a.date.localeCompare(b.date))[weighs.length - 1] : null;
  const [kg, setKg] = useState<number | null>(null);
  const val = kg ?? todayW?.kg ?? last?.kg ?? BODY.startKg;
  const avg = weighs ? movingAverage(weighs, day) : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-mute">Morgonvikt</div>
          <div className="text-xs text-mute">7-dagarsmedel {avg ? `${num(avg)} kg` : '–'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-11 w-11 rounded-xl bg-panel2 text-xl" onClick={() => setKg(Math.round((val - 0.1) * 10) / 10)}>
            −
          </button>
          <div className="w-16 text-center text-xl font-bold">{num(val)}</div>
          <button className="h-11 w-11 rounded-xl bg-panel2 text-xl" onClick={() => setKg(Math.round((val + 0.1) * 10) / 10)}>
            +
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button kind={todayW && kg == null ? 'ghost' : 'soft'} onClick={() => db.weighIns.put({ date: day, kg: val }).then(() => setKg(null))}>
          {todayW && kg == null ? '✓ Invägd' : 'Spara vikt'}
        </Button>
        <Button kind={protein?.done ? 'primary' : 'soft'} onClick={() => db.protein.put({ date: day, done: !protein?.done })}>
          {protein?.done ? '✓ Proteinmål' : 'Proteinmål nått'}
        </Button>
      </div>
    </Card>
  );
}
