import { useState } from 'react';
import { db, uid, type SwimRec } from '../db/db';
import { weekIndexForDate } from '../engine/planGenerator';
import { today } from '../lib/dates';
import { formatDuration, num, parseDuration, parseNum } from '../lib/format';
import { ask } from './confirm';
import { Button, Field, Segmented, Sheet, inputCls } from './ui';

/** Tempo per 100 m, t.ex. "2:05". */
export function pace100(distanceM: number, durationSec: number): string {
  if (!distanceM || !durationSec) return '–';
  const s = Math.round((durationSec / distanceM) * 100);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function swimSummary(w: SwimRec): string {
  return `${num(w.distanceM, 0)} m · ${formatDuration(w.durationSec)} · ${pace100(w.distanceM, w.durationSec)}/100 m${w.avgHr ? ` · ${w.avgHr} bpm` : ''}`;
}

export function SwimLogSheet({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: SwimRec }) {
  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Ändra simpass' : 'Logga simpass'}>
      {open && <SwimForm existing={existing} onDone={onClose} />}
    </Sheet>
  );
}

function SwimForm({ existing, onDone }: { existing?: SwimRec; onDone: () => void }) {
  const [date, setDate] = useState(existing?.date ?? today());
  const [m, setM] = useState(existing ? String(existing.distanceM) : '');
  const [time, setTime] = useState(existing ? formatDuration(existing.durationSec) : '');
  const [hr, setHr] = useState(existing?.avgHr ? String(existing.avgHr) : '');
  const [rpe, setRpe] = useState(existing?.rpe ?? 4);
  const [pool, setPool] = useState<SwimRec['pool']>(existing?.pool ?? 'bassang');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [err, setErr] = useState('');
  const dist = parseNum(m);
  const sec = parseDuration(time);

  async function save() {
    if (!dist || dist <= 0) return setErr('Fyll i distans i meter.');
    if (!sec || sec <= 0) return setErr('Fyll i tid (t.ex. 25:40).');
    const rec: SwimRec = {
      id: existing?.id ?? uid(),
      date,
      weekIndex: weekIndexForDate(date),
      distanceM: Math.round(dist),
      durationSec: sec,
      avgHr: hr ? Number(hr) : undefined,
      maxHr: existing?.maxHr,
      rpe,
      pool,
      notes,
      source: existing?.source ?? 'manuell',
      name: existing?.name,
      externalId: existing?.externalId,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await db.swims.put(rec);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distans (meter)">
          <input className={inputCls} inputMode="numeric" placeholder="t.ex. 1000" value={m} onChange={(e) => setM(e.target.value)} />
        </Field>
        <Field label="Tid" hint={dist && sec ? `Tempo ${pace100(dist, sec)}/100 m` : undefined}>
          <input className={inputCls} inputMode="decimal" placeholder="mm:ss" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      {err && <div className="text-sm text-bad">{err}</div>}
      <Button kind="swim" className="w-full" onClick={save}>
        Spara
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Snittpuls">
          <input className={inputCls} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
        </Field>
        <Field label="Datum">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label={`Ansträngning: ${rpe}/10`}>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setRpe(n)} className={`h-11 rounded-lg text-sm ${n === rpe ? 'bg-swim text-onaccent font-bold' : 'bg-panel2'}`}>
              {n}
            </button>
          ))}
        </div>
      </Field>
      <Segmented value={pool} onChange={setPool} options={[{ value: 'bassang', label: 'Bassäng' }, { value: 'oppet', label: 'Öppet vatten' }]} />
      {existing?.source && existing.source !== 'manuell' && <div className="text-xs text-mute">⌚ Från klockan{existing.name ? ` · ${existing.name}` : ''}</div>}
      <Field label="Anteckning">
        <textarea className={`${inputCls} min-h-20 py-2 text-base`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {existing && (
        <Button
          kind="danger"
          className="w-full"
          onClick={async () => {
            if (!(await ask('Ta bort simpasset?', { ok: 'Ta bort', danger: true }))) return;
            await db.swims.delete(existing.id);
            onDone();
          }}
        >
          Ta bort pass
        </Button>
      )}
    </div>
  );
}

/** Kort för ett loggat simpass (i veckovyn). */
export function SwimRow({ w, onClick }: { w: SwimRec; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative isolate w-full overflow-hidden rounded-2xl border border-line bg-panel px-4 py-3 text-left">
      <div className="absolute -z-10 inset-y-0 left-0 w-1 bg-swim" />
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-swim">Simning</div>
      <div className="font-semibold">
        {w.source !== 'manuell' ? '⌚ ' : ''}
        {w.name || (w.pool === 'oppet' ? 'Simning, öppet vatten' : 'Simning, bassäng')}
      </div>
      <div className="text-xs text-mute">{swimSummary(w)}</div>
    </button>
  );
}
