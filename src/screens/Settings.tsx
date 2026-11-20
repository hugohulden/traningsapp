import { useRef, useState } from 'react';
import { useAppSettings } from '../App';
import { db } from '../db/db';
import { exportAll, importAll, mergeHistory, HISTORY_FORMAT } from '../db/backup';
import { saveSettings, setThresholdManually, useCustomExercises } from '../db/store';
import { allExercises, getExercise, stepKg } from '../engine/gymPlan';
import { marathonLayout } from '../engine/planGenerator';
import { GYM_TEMPLATES, MARATHON } from '../plan/config';
import { formatShort, today, testDate, setTestDate } from '../lib/dates';
import { formatPace, num, parseDuration, parseNum } from '../lib/format';
import { zoneHr, zoneName, zoneText } from '../engine/running';
import { ZONES } from '../plan/config';
import { Button, Card, Field, Header, Segmented, Sheet, inputCls } from '../ui/ui';
import { syncIntervals } from '../sync/sync';
import { ask } from '../ui/confirm';
import { BUILD_TIME, checkForUpdate } from '../ui/update';

export async function exportBackupFile() {
  const data = await exportAll(db);
  const json = JSON.stringify(data);
  const name = `traningsapp-backup-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try {
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      await saveSettings({ lastBackupAt: new Date().toISOString() });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  await saveSettings({ lastBackupAt: new Date().toISOString() });
}

function PaceInput({ label, value, onSave, hint }: { label: string; value: number; onSave: (v: number) => void; hint?: string }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        inputMode="decimal"
        value={t ?? formatPace(value)}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => {
          const v = t != null ? parseDuration(t) : null;
          if (v && v > 120 && v < 600) onSave(v);
          setT(null);
        }}
      />
    </Field>
  );
}

function NumInput({ label, value, onSave, hint }: { label: string; value: number; onSave: (v: number) => void; hint?: string }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        inputMode="decimal"
        value={t ?? num(value, 2)}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => {
          const v = t != null ? parseNum(t) : null;
          if (v != null && v >= 0) onSave(v);
          setT(null);
        }}
      />
    </Field>
  );
}

export function SettingsScreen() {
  const s = useAppSettings();
  const custom = useCustomExercises();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [stepsOpen, setStepsOpen] = useState(false);
  const L = marathonLayout(s.marathonDate);

  const planIds = [...new Set(Object.values(GYM_TEMPLATES).flatMap((t) => t.slots.flatMap((sl) => [sl.exerciseId, ...(getExercise(sl.exerciseId)?.alternatives ?? [])])))];
  const extra = Object.entries(s.extraSets).filter(([, n]) => n > 0);

  return (
    <div>
      <Header title="Mer" sub="Inställningar, backup och installation" />
      <div className="p-4 space-y-4">
        <Card>
          <div className="font-semibold mb-3">Utseende</div>
          <Segmented
            value={s.theme ?? 'auto'}
            onChange={(v) => saveSettings({ theme: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Ljust' },
              { value: 'dark', label: 'Mörkt' },
            ]}
          />
          <div className="mt-2 text-xs text-mute">Auto följer telefonens inställning för ljust/mörkt läge.</div>
        </Card>
        <UpdateCard />
        <FoodSettingsCard />
        <Card>
          <div className="font-semibold mb-3">Backup</div>
          <div className="text-sm text-mute mb-3">
            All data finns bara på den här telefonen. Senaste backup: {s.lastBackupAt ? formatShort(s.lastBackupAt.slice(0, 10)) : 'aldrig'}. Du påminns var 14:e dag.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => exportBackupFile().then(() => setMsg('Backup exporterad.'))}>Exportera</Button>
            <Button kind="soft" onClick={() => fileRef.current?.click()}>
              Importera
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const json = JSON.parse(await f.text());
                if (json?.format === HISTORY_FORMAT) {
                  const r = await mergeHistory(db, json);
                  setMsg(`Inläst: ${[r.runs && `${r.runs} löppass`, r.gym && `${r.gym} gympass`, r.swims && `${r.swims} simpass`, r.recipes && `${r.recipes} ${r.recipes === 1 ? 'rätt/matlåda' : 'rätter/matlådor'}`, r.food && `${r.food} rader mat`].filter(Boolean).join(', ') || 'inget nytt (redan inläst)'}.`);
                  return;
                }
                if (!(await ask('Importen ersätter ALL data i appen med innehållet i filen. Fortsätta?', { ok: 'Ersätt', danger: true }))) return;
                await importAll(db, json);
                setMsg('Importen är klar.');
              } catch (err) {
                setMsg(`Importen misslyckades: ${(err as Error).message}`);
              }
            }}
          />
          {msg && <div className="mt-2 text-sm text-accent">{msg}</div>}
          <div className="mt-2 text-xs text-mute">På iPhone: välj ”Spara i Filer” (t.ex. iCloud Drive) när delningsmenyn öppnas.</div>
        </Card>

        <GarminSync />

        <Card>
          <div className="font-semibold mb-3">Löpning</div>
          <div className="grid grid-cols-2 gap-3">
            <PaceInput label="Tröskelfart T (min/km)" value={s.thresholdSec} onSave={(v) => setThresholdManually(v)} hint="Uppdateras av testlopp" />
            <PaceInput label="Lugn fart för km-uträkning" value={s.easyEstimateSec} onSave={(v) => saveSettings({ easyEstimateSec: v })} />
            <PaceInput label="Halvmara mål (min/km)" value={s.hmGoalSec} onSave={(v) => saveSettings({ hmGoalSec: v })} hint={`1:35 = 4:30/km`} />
            <PaceInput label="Halvmara drömmål" value={s.hmDreamSec} onSave={(v) => saveSettings({ hmDreamSec: v })} hint="1:30 = 4:16/km" />
          </div>
          <div className="mt-4 divide-y divide-line text-sm">
            {ZONES.map((z) => (
              <div key={z.key} className="flex justify-between gap-2 py-2">
                <span>{zoneName(z.key)}</span>
                <span className="text-right text-mute">
                  {zoneText(z.key, s)}
                  {zoneHr(z.key) !== '—' ? ` · ${zoneHr(z.key)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="font-semibold mb-1">Marathon</div>
          <div className="text-sm text-mute mb-3">
            Efter Varvet: 2 veckor återhämtning, sedan ett block på {MARATHON.minWeeks}–{MARATHON.maxWeeks} veckor (4 löppass/vecka, långpass upp till {MARATHON.peakLongKm} km, 3 gympass).
          </div>
          <Field label="Datum för marathon">
            <input className={inputCls} type="date" value={s.marathonDate ?? ''} min="2027-06-01" onChange={(e) => saveSettings({ marathonDate: e.target.value || null })} />
          </Field>
          {s.marathonDate && !L && <div className="mt-2 text-sm text-warn">Datumet måste ligga efter återhämtningen (från mitten av juni 2027).</div>}
          {L?.tooShort && <div className="mt-2 text-sm text-warn">Bara {L.blockWeeks} veckor efter återhämtningen – kortare än {MARATHON.minWeeks} veckor.</div>}
          {L && !L.tooShort && <div className="mt-2 text-sm text-accent">Blocket är {L.blockWeeks} veckor och syns i Plan.</div>}
        </Card>

        <Card>
          <div className="font-semibold mb-3">Gym</div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Hantelsteg (kg)" value={s.dumbbellStep} onSave={(v) => saveSettings({ dumbbellStep: v })} />
            <NumInput label="Maskin/kabel-steg (kg)" value={s.machineStep} onSave={(v) => saveSettings({ machineStep: v })} />
            <NumInput label="Vila basövning (s)" value={s.restCompoundSec} onSave={(v) => saveSettings({ restCompoundSec: v })} />
            <NumInput label="Vila isolation (s)" value={s.restIsolationSec} onSave={(v) => saveSettings({ restIsolationSec: v })} />
          </div>
          <label className="mt-3 flex items-center justify-between min-h-12">
            <span>Ljud när vilan är slut</span>
            <input type="checkbox" className="h-6 w-6 accent-[var(--color-accent)]" checked={s.soundOn} onChange={(e) => saveSettings({ soundOn: e.target.checked })} />
          </label>
          <div className="text-xs text-mute">iPhone kan inte vibrera från webbappar, så vilotimern piper och lyser grönt i stället.</div>
          <Button kind="soft" className="w-full mt-3" onClick={() => setStepsOpen(true)}>
            Ökningssteg per övning
          </Button>
          {extra.length > 0 && (
            <div className="mt-3">
              <div className="text-sm text-mute mb-1">Godkända extra set</div>
              {extra.map(([slot, n]) => {
                const sl = Object.values(GYM_TEMPLATES).flatMap((t) => t.slots).find((x) => x.slotId === slot);
                return (
                  <div key={slot} className="flex justify-between items-center py-1 text-sm">
                    <span>
                      {getExercise(sl?.exerciseId ?? '')?.name ?? slot}: +{n} set
                    </span>
                    <button className="text-mute text-xs underline" onClick={() => saveSettings({ extraSets: { ...s.extraSets, [slot]: Math.max(0, n - 1) } })}>
                      ta bort
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {custom && custom.length > 0 && (
            <div className="mt-3">
              <div className="text-sm text-mute mb-1">Egna övningar</div>
              {custom.map((c) => (
                <div key={c.id} className="text-sm py-1">
                  {c.name} <span className="text-mute">· {c.muscleGroup}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <TestMode />

        <Card>
          <div className="font-semibold mb-2">Lägg appen på hemskärmen (iPhone)</div>
          <ol className="list-decimal pl-5 text-sm space-y-1 text-mute">
            <li>Öppna appens adress i Safari.</li>
            <li>Tryck på dela-knappen (fyrkant med pil).</li>
            <li>Välj ”Lägg till på hemskärmen”.</li>
            <li>Öppna appen från ikonen. Den fungerar sedan utan nät.</li>
          </ol>
        </Card>
        <div className="text-center text-xs text-mute pb-4">Träning v1 · all data lokalt</div>
      </div>

      <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} title="Ökningssteg per övning">
        <div className="space-y-2">
          {[...planIds, ...(custom ?? []).map((c) => c.id)].map((id) => {
            const ex = getExercise(id) ?? allExercises().find((x) => x.id === id);
            if (!ex) return null;
            return (
              <div key={id} className="flex items-center gap-2">
                <div className="flex-1 text-sm">
                  {ex.name}
                  {s.stepOverrides[id] != null && <span className="text-accent"> · eget</span>}
                </div>
                <input
                  className={`${inputCls} w-24 text-center`}
                  inputMode="decimal"
                  defaultValue={num(stepKg(ex, s), 2)}
                  onBlur={(e) => {
                    const v = parseNum(e.target.value);
                    const o = { ...s.stepOverrides };
                    if (v == null) delete o[id];
                    else o[id] = v;
                    void saveSettings({ stepOverrides: o });
                  }}
                />
                <span className="text-sm text-mute w-6">kg</span>
              </div>
            );
          })}
          <div className="text-xs text-mute">0 = bara reps. Hantlar och maskiner följer standardstegen om du inte anger ett eget.</div>
        </div>
      </Sheet>
    </div>
  );
}

function TestMode() {
  const [d, setD] = useState(testDate() ?? '');
  const jump = (v: string | null) => {
    setTestDate(v);
    location.reload();
  };
  return (
    <Card>
      <div className="font-semibold mb-1">Testläge</div>
      <div className="text-sm text-mute mb-3">Låtsas att det är ett annat datum för att prova planen. Loggade pass sparas med det datumet.</div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} type="date" value={d} onChange={(e) => setD(e.target.value)} />
        <Button kind="soft" disabled={!d} onClick={() => jump(d)}>
          Använd datum
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Button kind="ghost" className="text-sm" onClick={() => jump('2026-11-16')}>
          Vecka 1
        </Button>
        <Button kind="ghost" className="text-sm" onClick={() => jump('2027-03-22')}>
          Vecka 19
        </Button>
        <Button kind="ghost" className="text-sm" onClick={() => jump('2027-05-17')}>
          Tävlingsv.
        </Button>
      </div>
      {testDate() && (
        <Button kind="danger" className="w-full mt-2" onClick={() => jump(null)}>
          Avsluta testläge ({formatShort(testDate()!)})
        </Button>
      )}
    </Card>
  );
}

function GarminSync() {
  const s = useAppSettings();
  const [key, setKey] = useState(s.intervalsApiKey);
  const [athlete, setAthlete] = useState(s.intervalsAthleteId);
  const [proxy, setProxy] = useState(s.intervalsProxyUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = key !== s.intervalsApiKey || athlete !== s.intervalsAthleteId || proxy !== s.intervalsProxyUrl;

  async function saveAndSync() {
    setBusy(true);
    setStatus('Hämtar…');
    await saveSettings({ intervalsApiKey: key.trim(), intervalsAthleteId: athlete.trim() || '0', intervalsProxyUrl: proxy.trim(), lastSyncAt: dirty ? null : s.lastSyncAt });
    const r = await syncIntervals(true);
    setStatus(r.error ? `⚠ ${r.message}` : `✓ ${r.message}`);
    setBusy(false);
  }

  return (
    <Card>
      <div className="font-semibold mb-1">⌚ Löppass från klockan</div>
      <div className="text-sm text-mute mb-3">
        Garmin → Intervals.icu → appen. Nya löppass hämtas automatiskt när du öppnar appen och kopplas till rätt pass i planen.
      </div>
      <ol className="list-decimal pl-5 text-sm text-mute space-y-1 mb-3">
        <li>Skapa ett gratis konto på intervals.icu och koppla Garmin Connect (Settings → Connections).</li>
        <li>Intervals.icu → Settings → Developer Settings → skapa API-nyckel.</li>
        <li>Klistra in nyckeln här och tryck Spara och synka.</li>
      </ol>
      <div className="space-y-3">
        <Field label="API-nyckel">
          <input className={inputCls} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Atlet-id" hint="0 = ditt konto">
            <input className={inputCls} value={athlete} onChange={(e) => setAthlete(e.target.value)} />
          </Field>
          <Field label="Mellanserver (valfri)" hint="Bara om direkt anrop blockeras">
            <input className={`${inputCls} text-sm`} placeholder="https://…workers.dev" value={proxy} onChange={(e) => setProxy(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" disabled={!key.trim() || busy} onClick={saveAndSync}>
          {dirty ? 'Spara och synka' : 'Synka nu'}
        </Button>
        {status && <div className={`text-sm ${status.startsWith('⚠') ? 'text-warn' : 'text-accent'}`}>{status}</div>}
        {!status && s.lastSyncAt && (
          <div className="text-xs text-mute">
            Senast: {new Date(s.lastSyncAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} · {s.lastSyncMessage}
          </div>
        )}
        <div className="text-xs text-mute">Nyckeln sparas bara i telefonen och följer inte med i backupfilen. Testlopp importeras också, men du fyller i själva testtiden.</div>
      </div>
    </Card>
  );
}

/** Mat: kalorimål och makrofördelning. */
function FoodSettingsCard() {
  const s = useAppSettings();
  const sum = s.macroPct.p + s.macroPct.c + s.macroPct.f;
  const target = s.maintenanceKcal + s.surplusKcal;
  const setPct = (k: 'p' | 'c' | 'f', v: number) => void saveSettings({ macroPct: { ...s.macroPct, [k]: Math.round(v) } });
  return (
    <Card>
      <div className="font-semibold mb-3">Mat</div>
      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Underhåll (kcal/dag)" value={s.maintenanceKcal} onSave={(v) => void saveSettings({ maintenanceKcal: Math.round(v) })} hint="Snitt total förbrukning enligt Garmin" />
        <NumInput label="Överskott (kcal/dag)" value={s.surplusKcal} onSave={(v) => void saveSettings({ surplusKcal: Math.round(v) })} />
      </div>
      <div className="mt-2 text-sm">
        Dagligt mål: <b>{target.toLocaleString('sv-SE')} kcal</b>
        <span className="text-mute"> (fyller du i dagens Garmin-förbrukning i Mat gäller den i stället för underhållet)</span>
      </div>
      <div className="mt-4 text-sm text-mute">Makrofördelning (% av kalorimålet)</div>
      <div className="mt-1 grid grid-cols-3 gap-3">
        <NumInput label="Protein %" value={s.macroPct.p} onSave={(v) => setPct('p', v)} hint={`${Math.round((target * s.macroPct.p) / 400)} g`} />
        <NumInput label="Kolhydrater %" value={s.macroPct.c} onSave={(v) => setPct('c', v)} hint={`${Math.round((target * s.macroPct.c) / 400)} g`} />
        <NumInput label="Fett %" value={s.macroPct.f} onSave={(v) => setPct('f', v)} hint={`${Math.round((target * s.macroPct.f) / 900)} g`} />
      </div>
      {sum !== 100 && <div className="mt-2 text-sm text-warn">Summan är {sum} % – den bör vara 100 %.</div>}

    </Card>
  );
}

/** Visar vilken version appen kör och låter dig söka efter en ny. */
function UpdateCard() {
  const [state, setState] = useState<'' | 'söker' | 'ny' | 'senaste' | 'fel'>('');
  const built = BUILD_TIME ? new Date(BUILD_TIME) : null;
  const label = built
    ? `${built.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} kl. ${built.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
    : 'okänd';
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">Appversion</div>
          <div className="text-sm text-mute">Från {label}</div>
          {state === 'senaste' && <div className="text-sm text-accent">Du har senaste versionen.</div>}
          {state === 'ny' && <div className="text-sm text-accent">Ny version hittad – appen laddas om…</div>}
          {state === 'fel' && <div className="text-sm text-warn">Kunde inte söka just nu (saknas nät?).</div>}
        </div>
        <Button
          kind="soft"
          className="shrink-0 text-sm"
          disabled={state === 'söker'}
          onClick={async () => {
            setState('söker');
            const r = await checkForUpdate();
            setState(r);
            if (r === 'ny') setTimeout(() => location.reload(), 4000);
          }}
        >
          {state === 'söker' ? 'Söker…' : 'Sök efter uppdatering'}
        </Button>
      </div>
    </Card>
  );
}
