import { useState } from 'react';
import type { PlannedSession, RunSpec } from '../engine/planGenerator';
import { plannedDurationSec, zoneHr, zoneName, zoneText, hmPrediction, paceOf } from '../engine/running';
import type { AppSettings } from '../plan/settings';
import { formatDuration, formatPace, num, parseDuration, parseNum } from '../lib/format';
import { saveRun } from '../db/store';
import { Button, Field, Segmented, Sheet, inputCls } from './ui';
import type { RunRec } from '../db/db';
import { today } from '../lib/dates';
import type { RunCategory } from '../engine/planGenerator';

export function ZoneList({ run, settings }: { run: RunSpec; settings: AppSettings }) {
  return (
    <div className="mt-2 space-y-1">
      {run.zones.map((z) => (
        <div key={z} className="flex justify-between gap-2 text-sm">
          <span className="text-mute">{zoneName(z)}</span>
          <span className="text-right">
            {zoneText(z, settings)}
            {zoneHr(z) !== '—' && <span className="text-mute"> · puls {zoneHr(z)}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

const DEFAULT_RPE: Record<RunCategory, number> = { lugn: 3, extra: 3, lang: 5, kvalitet: 7, test: 9, lopp: 9 };

export function RunLogSheet({
  open,
  onClose,
  planned,
  settings,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  planned?: PlannedSession;
  settings: AppSettings;
  existing?: RunRec;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Ändra löppass' : planned ? `Logga: ${planned.title}` : 'Logga löppass'}>
      {open && <RunForm planned={planned} settings={settings} existing={existing} onDone={onClose} />}
    </Sheet>
  );
}

function RunForm({ planned, settings, existing, onDone }: { planned?: PlannedSession; settings: AppSettings; existing?: RunRec; onDone: () => void }) {
  const r = planned?.run;
  const isTest = r?.category === 'test';
  const estimate = r ? plannedDurationSec(r, settings) : 0;
  const [date, setDate] = useState(existing?.date ?? (planned && planned.date <= today() ? planned.date : today()));
  const [km, setKm] = useState(existing ? num(existing.distanceKm, 2) : r ? num(r.km, 2) : '');
  const [time, setTime] = useState(existing ? formatDuration(existing.durationSec) : r && !isTest ? formatDuration(estimate) : '');
  const [hr, setHr] = useState(existing?.avgHr ? String(existing.avgHr) : '');
  const [rpe, setRpe] = useState(existing?.rpe ?? (r ? DEFAULT_RPE[r.category] : 3));
  const [surface, setSurface] = useState<'ute' | 'lopband'>(existing?.surface ?? 'ute');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [ivPace, setIvPace] = useState(existing?.intervalPaceSec ? formatPace(existing.intervalPaceSec) : '');
  const [category, setCategory] = useState<RunCategory>(existing?.category ?? r?.category ?? 'lugn');
  const [test, setTest] = useState<'' | '5k' | '10k' | 'race'>(existing?.test ?? (r?.test ? r.test : r?.category === 'lopp' ? 'race' : ''));
  const [testTime, setTestTime] = useState(existing?.testTimeSec ? formatDuration(existing.testTimeSec) : '');
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const kmN = parseNum(km);
  const sec = parseDuration(time);
  const pace = kmN && sec ? paceOf(kmN, sec) : null;
  const hasIntervals = !!r?.blocks?.length || category === 'kvalitet';

  async function submit() {
    if (!kmN || kmN <= 0) return setErr('Fyll i distans.');
    if (!sec || sec <= 0) return setErr('Fyll i tid (t.ex. 48:30 eller 1:31:05).');
    const ivp = ivPace ? parseDuration(ivPace) : null;
    const isTestDist = test === '5k' || test === '10k';
    const tts = testTime ? parseDuration(testTime) : null;
    if (isTestDist && existing?.needsTestTime && !tts) return setErr(`Fyll i tiden för själva ${test === '5k' ? '5 km' : '10 km'}.`);
    const res = await saveRun({
      id: existing?.id,
      date,
      plannedKey: existing?.plannedKey ?? planned?.key ?? null,
      category,
      distanceKm: kmN,
      durationSec: sec,
      avgHr: hr ? Number(hr) : undefined,
      rpe,
      surface,
      notes,
      intervalPaceSec: ivp ?? undefined,
      test: test || undefined,
      plannedWorkKm: existing?.plannedWorkKm ?? r?.workKm,
      plannedKm: existing?.plannedKm ?? r?.km,
      source: existing?.source ?? 'manuell',
      externalId: existing?.externalId,
      activityType: existing?.activityType,
      maxHr: existing?.maxHr,
      elevationGainM: existing?.elevationGainM,
      cadence: existing?.cadence,
      name: existing?.name,
      testTimeSec: isTestDist ? (tts ?? undefined) : undefined,
      needsTestTime: undefined,
    });
    if (res.newThreshold) {
      const t = test as '5k' | '10k';
      const ts = (testTime ? parseDuration(testTime) : null) ?? sec;
      setResult(`Ny tröskelfart T = ${formatPace(res.newThreshold)}/km. Halvmaraprognos ${formatDuration(hmPrediction(t, ts))}. Fartzonerna är uppdaterade.`);
    } else onDone();
  }

  if (result)
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-accent/10 border border-accent/40 p-4 text-accent">{result}</div>
        <Button className="w-full" onClick={onDone}>
          Klar
        </Button>
      </div>
    );

  return (
    <div className="space-y-4">
      {r && (
        <div className="rounded-xl bg-panel2 p-3 text-sm">
          <div className="font-medium">{r.text}</div>
          <ZoneList run={r} settings={settings} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distans (km)">
          <input className={inputCls} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </Field>
        <Field label="Tid" hint={pace ? `Tempo ${formatPace(pace)}/km` : isTest ? 'Skriv in testtiden' : undefined}>
          <input className={inputCls} inputMode="decimal" placeholder="mm:ss" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Button kind="run" className="w-full" onClick={submit}>
        Spara
      </Button>
      {err && <div className="text-bad text-sm">{err}</div>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Snittpuls">
          <input className={inputCls} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
        </Field>
        <Field label="Datum">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {hasIntervals && (
        <Field label="Snittfart på intervallerna (valfritt)" hint="min/km, t.ex. 4:12">
          <input className={inputCls} inputMode="decimal" placeholder="m:ss" value={ivPace} onChange={(e) => setIvPace(e.target.value)} />
        </Field>
      )}
      <Field label={`Ansträngning: ${rpe}/10`}>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setRpe(n)} className={`h-11 rounded-lg text-sm ${n === rpe ? 'bg-run text-onaccent font-bold' : 'bg-panel2'}`}>
              {n}
            </button>
          ))}
        </div>
      </Field>
      <Segmented value={surface} onChange={setSurface} options={[{ value: 'ute', label: 'Ute' }, { value: 'lopband', label: 'Löpband' }]} />
      {!planned && !existing && (
        <Field label="Typ av pass">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as RunCategory)}>
            <option value="lugn">Lugnt</option>
            <option value="kvalitet">Kvalitet</option>
            <option value="lang">Långpass</option>
            <option value="test">Testlopp</option>
            <option value="lopp">Lopp</option>
          </select>
        </Field>
      )}
      {(category === 'test' || category === 'lopp') && !r?.test && (
        <Field label="Testdistans (uppdaterar tröskelfarten)">
          <Segmented
            value={test}
            onChange={setTest}
            options={[
              { value: '', label: 'Inget' },
              { value: '5k', label: '5 km' },
              { value: '10k', label: '10 km' },
              { value: 'race', label: 'Annat lopp' },
            ]}
          />
        </Field>
      )}
      {(test === '5k' || test === '10k') && (
        <Field label={`Testtid för själva ${test === '5k' ? '5 km' : '10 km'}`} hint="Uppdaterar tröskelfarten. Lämna tomt om hela passet var testet.">
          <input className={`${inputCls} ${existing?.needsTestTime ? 'border-warn' : ''}`} inputMode="decimal" placeholder="mm:ss" value={testTime} onChange={(e) => setTestTime(e.target.value)} />
        </Field>
      )}
      {existing?.source === 'intervals' && <div className="text-xs text-mute">⌚ Importerat från klockan via Intervals.icu{existing.name ? ` · ${existing.name}` : ''}</div>}
      <Field label="Anteckning">
        <textarea className={`${inputCls} min-h-20 py-2 text-base`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </div>
  );
}
