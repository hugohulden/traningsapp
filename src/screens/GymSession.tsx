import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppSettings, useNav } from '../App';
import { db, type GymSessionRec, type SessionExercise, type SessionSet } from '../db/db';
import {
  addCustomExercise,
  addExerciseToSession,
  allHistory,
  bestE1rm,
  deleteGymSession,
  finishGymSession,
  latestBodyKg,
  saveGymSession,
  sessionSummary,
  switchExercise,
  useCustomExercises,
  type SummaryLine,
} from '../db/store';
import { allExercises, getExercise, stepKg } from '../engine/gymPlan';
import { epley, type HistoryEntry } from '../engine/progression';
import { num, parseNum, formatDuration } from '../lib/format';
import { formatShort } from '../lib/dates';
import { Badge, Button, Card, Field, Header, Segmented, Sheet, inputCls } from '../ui/ui';
import { unlockAudio, useRestTimer, useWakeLock } from '../ui/restTimer';
import type { EquipmentKind, MuscleGroup } from '../plan/types';
import { GYM_TEMPLATES } from '../plan/config';
import { ask } from '../ui/confirm';
import { weekIndexForDate } from '../engine/planGenerator';

export function GymSessionScreen({ id }: { id: string }) {
  const nav = useNav();
  const settings = useAppSettings();
  const [rec, setRec] = useState<GymSessionRec | null>(null);
  const [hist, setHist] = useState<Map<string, HistoryEntry[]>>(new Map());
  const [bodyKg, setBodyKg] = useState(73.5);
  const [summary, setSummary] = useState<SummaryLine[] | null>(null);
  const [switchIdx, setSwitchIdx] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const timer = useRestTimer(settings.soundOn);
  const [, tick] = useState(0);
  useWakeLock(!!rec && rec.status === 'active');

  useEffect(() => {
    db.gymSessions.get(id).then((r) => setRec(r ?? null));
    allHistory(id).then(setHist);
    latestBodyKg().then(setBodyKg);
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [id]);

  const update = (r: GymSessionRec) => {
    setRec(r);
    void saveGymSession(r);
  };

  if (!rec) return <div className="p-6 text-mute">Laddar pass…</div>;

  if (summary) return <Summary rec={rec} lines={summary} onClose={() => nav.pop()} onEdit={() => setSummary(null)} />;

  const editing = rec.status === 'done';

  const wellness = rec.exercises.some((e) => e.target.wellnessNotice);
  const undone = rec.exercises.filter((e) => !e.skipped).reduce((a, e) => a + e.sets.filter((s) => !s.done).length, 0);
  const elapsed = Math.floor((Date.now() - rec.startedAt) / 1000);

  // Avsluta när du vill: bara avbockade set sparas som gjorda.
  async function finish() {
    timer.stop();
    const done = await finishGymSession(rec!);
    setRec(done);
    setSummary(await sessionSummary(done));
  }

  function onSetDone(exIdx: number, setIdx: number, warm: boolean) {
    unlockAudio();
    const r = structuredClone(rec!);
    const e = r.exercises[exIdx];
    const list = warm ? e.warmups : e.sets;
    const s = list[setIdx];
    if (s.done) {
      s.done = false;
      s.pr = false;
      update(r);
      return;
    }
    if (s.weight == null) {
      document.getElementById(`w-${exIdx}-${setIdx}`)?.focus();
      return;
    }
    s.done = true;
    if (editing) {
      update(r);
      return;
    }
    if (!warm) {
      const ex = getExercise(e.exerciseId);
      const extra = ex?.bodyweight ? bodyKg : 0;
      const prevBest = ex ? bestE1rm(hist.get(e.exerciseId) ?? [], ex, bodyKg) : 0;
      const sessionBest = Math.max(0, ...e.sets.filter((x, i) => x.done && i !== setIdx && x.weight != null).map((x) => epley(x.weight! + extra, x.reps)));
      const mine = epley(s.weight + extra, s.reps);
      s.pr = prevBest > 0 && mine > prevBest + 1e-6 && mine > sessionBest;
      const compound = ex?.compound ?? false;
      timer.start(e.mode === 'deload' && !compound ? settings.restIsolationSec : compound ? settings.restCompoundSec : settings.restIsolationSec);
    } else {
      timer.start(60);
    }
    update(r);
  }

  return (
    <div className="pb-40">
      <Header
        title={rec.title}
        onBack={() => nav.pop()}
        sub={editing ? `Sparat pass ${formatShort(rec.date)} · ändringar sparas direkt` : `${formatDuration(elapsed - (elapsed % 60))} · ${rec.deload ? 'deload · ' : ''}sparas automatiskt${undone ? ` · ${undone} set kvar` : ''}`}
        right={
          editing ? (
            <Button kind="primary" className="min-h-10 px-3 text-sm" onClick={() => nav.pop()}>
              Klar
            </Button>
          ) : (
            <Button kind="primary" className="min-h-10 px-3 text-sm" onClick={finish}>
              Avsluta
            </Button>
          )
        }
      />
      <div className="space-y-4 p-3">
        {wellness && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
            Någon övning står still eller går bakåt och vikten har sänkts lite. Kolla sömn, mat och vikttrend.
          </div>
        )}
        {rec.exercises.map((e, i) => (
          <ExerciseCard
            key={`${e.slotId}-${e.exerciseId}`}
            e={e}
            exIdx={i}
            history={hist.get(e.exerciseId) ?? []}
            onChange={(ne) => {
              const r = structuredClone(rec);
              r.exercises[i] = ne;
              update(r);
            }}
            onDone={(si, warm) => onSetDone(i, si, warm)}
            onSwitch={() => setSwitchIdx(i)}
          />
        ))}
        <Button kind="soft" className="w-full" onClick={() => setAddOpen(true)}>
          + Lägg till övning
        </Button>
        <Card className="space-y-3">
          {editing && (
            <Field label="Datum">
              <input className={inputCls} type="date" value={rec.date} onChange={(ev) => ev.target.value && update({ ...rec, date: ev.target.value, weekIndex: weekIndexForDate(ev.target.value) })} />
            </Field>
          )}
          <Field label="Anteckning för passet">
            <textarea className={`${inputCls} min-h-20 py-2 text-base`} value={rec.notes} onChange={(ev) => update({ ...rec, notes: ev.target.value })} />
          </Field>
        </Card>
        <Button
          kind="danger"
          className="w-full"
          onClick={async () => {
            if (!(await ask(editing ? 'Ta bort det sparade passet?' : 'Slänga passet? Inget av det sparas.', { ok: editing ? 'Ta bort' : 'Släng', danger: true }))) return;
            timer.stop();
            await deleteGymSession(rec.id);
            nav.pop();
          }}
        >
          {editing ? 'Ta bort pass' : 'Släng pass'}
        </Button>
      </div>

      {!editing && <RestBar timer={timer} />}

      <ExercisePicker
        open={switchIdx != null}
        title="Byt övning"
        options={switchIdx != null ? switchOptions(rec.exercises[switchIdx]) : []}
        current={switchIdx != null ? rec.exercises[switchIdx].exerciseId : undefined}
        onClose={() => setSwitchIdx(null)}
        onPick={async (exId) => {
          const idx = switchIdx!;
          if (rec.exercises[idx].sets.some((s) => s.done) && !(await ask('Avbockade set på den här övningen försvinner. Byta ändå?', { ok: 'Byt' }))) return;
          const r = await switchExercise(rec, idx, exId);
          setRec(r);
          setHist(await allHistory(id));
          setSwitchIdx(null);
        }}
      />
      <ExercisePicker
        open={addOpen}
        title="Lägg till övning"
        options={allExercises().map((x) => x.id)}
        onClose={() => setAddOpen(false)}
        onPick={async (exId) => {
          setRec(await addExerciseToSession(rec, exId));
          setHist(await allHistory(id));
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function switchOptions(e: SessionExercise): string[] {
  const slot = Object.values(GYM_TEMPLATES).flatMap((t) => t.slots).find((x) => x.slotId === e.slotId);
  if (!slot) return allExercises().map((x) => x.id);
  const base = getExercise(slot.exerciseId)!;
  const ids = new Set<string>([base.id, ...base.alternatives, e.exerciseId]);
  allExercises().filter((x) => x.custom).forEach((x) => ids.add(x.id));
  return [...ids];
}

function ExerciseCard({
  e,
  exIdx,
  history,
  onChange,
  onDone,
  onSwitch,
}: {
  e: SessionExercise;
  exIdx: number;
  history: HistoryEntry[];
  onChange: (e: SessionExercise) => void;
  onDone: (setIdx: number, warm: boolean) => void;
  onSwitch: () => void;
}) {
  const settings = useAppSettings();
  const ex = getExercise(e.exerciseId);
  const [notesOpen, setNotesOpen] = useState(!!e.notes);
  if (!ex) return null;
  const realStep = stepKg(ex, settings);
  const step = realStep || 2.5;
  const last = [...history].reverse().find((h) => h.mode !== 'deload') ?? history[history.length - 1];
  const p = e.prescription;
  const allDone = e.sets.length > 0 && e.sets.every((s) => s.done);

  const setField = (warm: boolean, i: number, patch: Partial<SessionSet>) => {
    const ne = structuredClone(e);
    const list = warm ? ne.warmups : ne.sets;
    const old = list[i];
    list[i] = { ...old, ...patch };
    // Ändrad vikt följer med till kommande set som hade samma vikt.
    if (!warm && patch.weight !== undefined) {
      for (let j = i + 1; j < list.length; j++) if (!list[j].done && (list[j].weight === old.weight || list[j].weight == null)) list[j].weight = patch.weight;
    }
    onChange(ne);
  };

  if (e.skipped)
    return (
      <Card className="opacity-60">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{ex.name}</div>
            <div className="text-sm text-mute">Hoppas över</div>
          </div>
          <Button kind="ghost" className="min-h-10 text-sm" onClick={() => onChange({ ...e, skipped: false })}>
            Ångra
          </Button>
        </div>
      </Card>
    );

  return (
    <Card className={`p-3 ${allDone ? 'border-accent/50' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold leading-tight">{ex.name}</div>
            {e.optional && <Badge>valfri</Badge>}
            {e.mode === 'underhall' && <Badge tone="run">underhåll</Badge>}
          </div>
          <div className="text-sm text-mute">
            {e.sets.length} × {p.repMin}
            {p.repMax !== p.repMin ? `–${p.repMax}` : ''} · RIR {e.target.rir[0]}
            {e.target.rir[1] !== e.target.rir[0] ? `–${e.target.rir[1]}` : ''} · {realStep ? `steg ${num(realStep, 2)} kg` : 'ökning i reps'}
          </div>
        </div>
        <button onClick={onSwitch} className="h-10 rounded-lg bg-panel2 px-3 text-sm shrink-0" aria-label="Byt övning">
          ⇄ Byt
        </button>
      </div>

      <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${e.target.kind === 'okning' ? 'bg-accent/10 text-accent' : e.target.kind === 'sankning' ? 'bg-warn/10 text-warn' : 'bg-panel2 text-mute'}`}>
        {e.target.reason}
        {e.target.suggestion && <div className="mt-1 text-ink">{e.target.suggestion}</div>}
      </div>
      <div className="mt-1 text-xs text-mute">
        Förra gången:{' '}
        {last ? `${last.sets.map((s) => `${num(s.weight, 2)}×${s.reps}`).join(', ')}${last.mode === 'deload' ? ' (deload)' : ''}` : 'inget loggat'}
      </div>

      {e.warmups.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-mute mb-1">Uppvärmning</div>
          {e.warmups.map((s, i) => (
            <SetRow key={`w${i}`} label="U" s={s} id={`ww-${exIdx}-${i}`} step={step} bodyweight={ex.bodyweight} warm onChange={(pt) => setField(true, i, pt)} onDone={() => onDone(i, true)} />
          ))}
        </div>
      )}

      <div className="mt-2 space-y-1">
        {e.sets.map((s, i) => (
          <SetRow key={i} label={String(i + 1)} s={s} id={`w-${exIdx}-${i}`} step={step} bodyweight={ex.bodyweight} onChange={(pt) => setField(false, i, pt)} onDone={() => onDone(i, false)} />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <button
          className="h-9 rounded-lg bg-panel2 px-3"
          onClick={() => {
            const lastSet = e.sets[e.sets.length - 1];
            onChange({ ...e, sets: [...e.sets, { weight: lastSet?.weight ?? null, reps: lastSet?.reps ?? p.repMin, done: false }] });
          }}
        >
          + Set
        </button>
        {e.sets.length > 1 && !e.sets[e.sets.length - 1].done && (
          <button className="h-9 rounded-lg bg-panel2 px-3" onClick={() => onChange({ ...e, sets: e.sets.slice(0, -1) })}>
            − Set
          </button>
        )}
        <button className="h-9 rounded-lg bg-panel2 px-3" onClick={() => setNotesOpen((x) => !x)}>
          Anteckning
        </button>
        {e.optional && !e.sets.some((x) => x.done) && (
          <button className="h-9 rounded-lg bg-panel2 px-3" onClick={() => onChange({ ...e, skipped: true })}>
            Hoppa över
          </button>
        )}
      </div>
      {notesOpen && <textarea className={`${inputCls} mt-2 min-h-16 py-2 text-base`} placeholder="Anteckning för övningen" value={e.notes} onChange={(ev) => onChange({ ...e, notes: ev.target.value })} />}
    </Card>
  );
}

function SetRow({
  label,
  s,
  id,
  step,
  bodyweight,
  warm,
  onChange,
  onDone,
}: {
  label: string;
  s: SessionSet;
  id: string;
  step: number;
  bodyweight?: boolean;
  warm?: boolean;
  onChange: (p: Partial<SessionSet>) => void;
  onDone: () => void;
}) {
  const [wText, setWText] = useState<string | null>(null);
  const shown = wText ?? (s.weight == null ? '' : num(s.weight, 2));
  const commit = () => {
    if (wText == null) return;
    const v = parseNum(wText);
    onChange({ weight: v == null ? null : Math.max(0, v) });
    setWText(null);
  };
  const rirCycle = () => onChange({ rir: s.rir == null ? 0 : s.rir >= 4 ? undefined : s.rir + 1 });
  const btn = 'h-12 w-full rounded-lg bg-panel2 text-xl active:bg-line';

  return (
    <div className={`grid ${warm ? 'grid-cols-[18px_30px_1fr_30px_30px_26px_30px_44px]' : 'grid-cols-[18px_30px_1fr_30px_30px_26px_30px_34px_44px]'} items-center gap-1 rounded-xl px-0.5 py-1 ${s.done ? 'bg-accent/10' : ''} ${warm ? 'opacity-80' : ''}`}>
      <div className="text-center text-sm text-mute">{s.pr ? '🏆' : label}</div>
      <button className={btn} onClick={() => onChange({ weight: Math.max(0, Math.round(((s.weight ?? 0) - step) * 100) / 100) })}>
        −
      </button>
      <div className="min-w-0 text-center">
        <input
          id={id}
          className="w-full bg-transparent text-center text-lg font-bold outline-none placeholder:text-warn placeholder:font-normal placeholder:text-sm"
          inputMode="decimal"
          placeholder="vikt?"
          value={shown}
          onChange={(ev) => setWText(ev.target.value)}
          onBlur={commit}
          onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
        />
        <div className="text-[10px] text-mute -mt-1">{bodyweight ? '+kg' : 'kg'}</div>
      </div>
      <button className={btn} onClick={() => onChange({ weight: Math.round(((s.weight ?? 0) + step) * 100) / 100 })}>
        +
      </button>
      <button className={btn} onClick={() => onChange({ reps: Math.max(0, s.reps - 1) })}>
        −
      </button>
      <div className="text-center">
        <div className="text-lg font-bold">{s.reps}</div>
        <div className="text-[10px] text-mute -mt-1">reps</div>
      </div>
      <button className={btn} onClick={() => onChange({ reps: s.reps + 1 })}>
        +
      </button>
      {!warm && (
        <button onClick={rirCycle} className="h-12 w-full rounded-lg bg-panel2 text-[10px] leading-tight" aria-label="RIR">
          RIR
          <br />
          <span className="text-sm font-bold">{s.rir ?? '–'}</span>
        </button>
      )}
      <button
        onClick={onDone}
        className={`h-12 w-full rounded-xl text-2xl font-bold ${s.done ? 'bg-accent text-black' : 'bg-panel2 border border-line text-mute'}`}
        aria-label="Klart"
      >
        ✓
      </button>
    </div>
  );
}

function RestBar({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  if (timer.remaining == null) return null;
  const r = Math.max(0, timer.remaining);
  const pct = timer.total ? (1 - r / timer.total) * 100 : 0;
  return (
    <div className={`fixed bottom-0 inset-x-0 z-40 border-t safe-bottom ${timer.finished ? 'bg-accent text-black border-accent' : 'bg-panel border-line'}`}>
      <div className="h-1 bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex-1">
          <div className={`text-xs ${timer.finished ? '' : 'text-mute'}`}>{timer.finished ? 'Vilan är slut – kör!' : 'Vila'}</div>
          <div className="text-3xl font-bold">{formatDuration(r)}</div>
        </div>
        {!timer.finished && (
          <button className="h-12 rounded-xl bg-panel2 px-4" onClick={() => timer.add(30)}>
            +30 s
          </button>
        )}
        <button className={`h-12 rounded-xl px-4 ${timer.finished ? 'bg-black/20' : 'bg-panel2'}`} onClick={() => timer.stop()}>
          {timer.finished ? 'OK' : 'Hoppa över'}
        </button>
      </div>
    </div>
  );
}

const GROUPS: MuscleGroup[] = ['Framsida lår', 'Baksida lår/säte', 'Vader', 'Mage', 'Bröst', 'Rygg', 'Axlar', 'Biceps', 'Triceps'];
const KINDS: EquipmentKind[] = ['skivstång', 'hantlar', 'maskin', 'kabel', 'kroppsvikt'];

function ExercisePicker({
  open,
  title,
  options,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  options: string[];
  current?: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  useCustomExercises();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<MuscleGroup>('Rygg');
  const [kind, setKind] = useState<EquipmentKind>('maskin');
  const [compound, setCompound] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () => options.map((id) => getExercise(id)).filter((x): x is NonNullable<typeof x> => !!x && x.name.toLowerCase().includes(q.toLowerCase())),
    [options, q],
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {!creating ? (
        <div className="space-y-2">
          {options.length > 8 && <input ref={ref} className={inputCls} placeholder="Sök" value={q} onChange={(e) => setQ(e.target.value)} />}
          {list.map((x) => (
            <button
              key={x.id}
              onClick={() => onPick(x.id)}
              className={`w-full min-h-12 rounded-xl px-3 py-2 text-left ${x.id === current ? 'bg-accent/15 text-accent' : 'bg-panel2'}`}
            >
              <div className="font-medium">{x.name}</div>
              <div className="text-xs text-mute">
                {x.muscleGroup} · {x.kind}
                {x.custom ? ' · egen' : ''}
              </div>
            </button>
          ))}
          <div className="text-xs text-mute">Alternativ har egen historik och egen progression.</div>
          <Button kind="ghost" className="w-full" onClick={() => setCreating(true)}>
            + Ny egen övning
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Namn">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Muskelgrupp">
            <select className={inputCls} value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup)}>
              {GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Utrustning">
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>
              {KINDS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Segmented value={compound ? 'bas' : 'iso'} onChange={(v) => setCompound(v === 'bas')} options={[{ value: 'iso', label: 'Isolation (60–90 s vila)' }, { value: 'bas', label: 'Bas (2–3 min)' }]} />
          <Button
            className="w-full"
            disabled={!name.trim()}
            onClick={async () => {
              const e = await addCustomExercise({
                name: name.trim(),
                muscleGroup: group,
                kind,
                compound,
                bodyweight: kind === 'kroppsvikt',
                step: kind === 'hantlar' ? { type: 'hantel' } : kind === 'skivstång' ? { type: 'fast', kg: 2.5 } : kind === 'kroppsvikt' ? { type: 'fast', kg: 2.5 } : { type: 'maskin' },
              });
              setCreating(false);
              setName('');
              onPick(e.id);
            }}
          >
            Skapa och välj
          </Button>
          <Button kind="ghost" className="w-full" onClick={() => setCreating(false)}>
            Avbryt
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Summary({ rec, lines, onClose, onEdit }: { rec: GymSessionRec; lines: SummaryLine[]; onClose: () => void; onEdit: () => void }) {
  const mins = rec.finishedAt ? Math.round((rec.finishedAt - rec.startedAt) / 60000) : 0;
  const sets = rec.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const improved = lines.filter((l) => l.improved).length;
  return (
    <div className="pb-10">
      <Header title="Bra jobbat!" sub={`${rec.title} · ${mins} min · ${sets} set`} />
      <div className="space-y-3 p-4">
        <Card>
          <div className="text-lg font-semibold">
            {improved > 0 ? `${improved} övning${improved > 1 ? 'ar' : ''} ökade` : rec.deload ? 'Deload klar – ingen progression förväntas' : 'Passet är sparat'}
          </div>
          {lines.some((l) => l.pr) && <div className="mt-1 text-accent">🏆 Nya personbästa: {lines.filter((l) => l.pr).map((l) => l.name).join(', ')}</div>}
        </Card>
        {lines.map((l) => (
          <Card key={l.exerciseId} className="p-3">
            <div className="flex items-center gap-2">
              <div className="font-semibold flex-1">{l.name}</div>
              {l.pr && <Badge tone="accent">PB</Badge>}
              {l.improved && <Badge tone="accent">↑ ökade</Badge>}
            </div>
            <div className="mt-1 text-sm">Idag: {l.did}</div>
            <div className="text-sm text-accent">Nästa gång: {l.next}</div>
            <div className="text-xs text-mute">{l.nextReason}</div>
          </Card>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Button kind="soft" onClick={onEdit}>
            Ändra passet
          </Button>
          <Button onClick={onClose}>Klar</Button>
        </div>
      </div>
    </div>
  );
}
