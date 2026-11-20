/**
 * AI-foto: fota maten → din Cloudflare Worker frågar Claude → justera förslaget → logga.
 * API-nyckeln finns bara i Workern; appen skickar bara bilden och din appkod.
 */
import { useRef, useState } from 'react';
import { useAppSettings, useNav } from '../../App';
import { db, uid, type FoodLogRec, type Meal } from '../../db/db';
import { num, parseNum } from '../../lib/format';
import { Button, inputCls } from '../../ui/ui';
import { toast } from '../../ui/toast';
import { MEAL_NAMES } from '../engine';
import { deleteLogs } from '../store';
import { kcalStr } from './parts';

interface Item {
  key: string;
  name: string;
  grams: number;
  /** Ursprungligt förslag – mängden skalas mot det. */
  base: { grams: number; kcal: number; p: number; c: number; f: number };
}

/** Skalar ner bilden (max 1024 px) och gör om till base64-JPEG. */
async function toJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const k = Math.min(1, 1024 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(bmp as CanvasImageSource, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}

function scaled(it: Item) {
  const k = it.base.grams > 0 ? it.grams / it.base.grams : 1;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return { kcal: Math.round(it.base.kcal * k), p: r(it.base.p), c: r(it.base.c), f: r(it.base.f) };
}

export default function PhotoPane({ meal, date, onDone }: { meal: Meal; date: string; onDone: () => void }) {
  const s = useAppSettings();
  const nav = useNav();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [hint, setHint] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [file, setFile] = useState<File | null>(null);

  if (!s.aiProxyUrl || !s.aiAppCode) {
    return (
      <div className="space-y-3 py-2 text-sm">
        <div className="rounded-2xl bg-panel2 p-4">
          <div className="font-semibold">AI-foto är inte inställt än</div>
          <div className="mt-1 text-mute">
            Fotot analyseras av Claude via din egen Cloudflare Worker (gratis), så att API-nyckeln aldrig ligger i appen. Lägg in Worker-adressen och appkoden under Mer → Mat. Steg för steg finns i README → "AI-foto".
          </div>
        </div>
        <Button kind="soft" className="w-full" onClick={() => (onDone(), nav.setTab('mer'))}>
          Gå till Mer
        </Button>
      </div>
    );
  }

  async function analyse(f: File) {
    setErr('');
    setItems(null);
    setBusy(true);
    try {
      if (!navigator.onLine) throw new Error('AI-foto kräver internet.');
      const image = await toJpeg(f);
      setPreview(`data:image/jpeg;base64,${image}`);
      const res = await fetch(s.aiProxyUrl.replace(/\/$/, ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Code': s.aiAppCode },
        body: JSON.stringify({ image, mediaType: 'image/jpeg', note: hint.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { items?: { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }[]; note?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Workern svarade ${res.status}.`);
      const list = (data.items ?? []).map((i) => ({ key: uid(), name: i.name, grams: i.grams, base: { grams: i.grams, kcal: i.kcal, p: i.protein, c: i.carbs, f: i.fat } }));
      setItems(list);
      setNote(data.note ?? '');
      if (!list.length) setErr(data.note || 'Hittade ingen mat på bilden.');
    } catch (e) {
      setErr(e instanceof TypeError ? 'Kunde inte nå din Worker. Kontrollera adressen under Mer → Mat.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = (items ?? []).reduce((a, it) => a + scaled(it).kcal, 0);

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            setFile(f);
            void analyse(f);
          }
        }}
      />
      {!preview && !busy && (
        <>
          <button onClick={() => input.current?.click()} className="glow-accent flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-3xl bg-accent text-onaccent">
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
            </svg>
            <span className="text-lg font-bold">Fota maten</span>
          </button>
          <input className={inputCls} placeholder="Tillägg (valfritt), t.ex. 'stekt i smör'" value={hint} onChange={(e) => setHint(e.target.value)} />
          <div className="text-xs text-mute">En uppskattning, inte exakt. Du kan justera mängderna innan du loggar.</div>
        </>
      )}
      {preview && <img src={preview} alt="" className="max-h-48 w-full rounded-2xl object-cover" />}
      {busy && <div className="py-4 text-center text-sm text-mute">Claude tittar på bilden…</div>}
      {err && (
        <div className="space-y-2">
          <div className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{err}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button kind="soft" onClick={() => input.current?.click()}>
              Ta ny bild
            </Button>
            {file && (
              <Button kind="soft" onClick={() => void analyse(file)}>
                Försök igen
              </Button>
            )}
          </div>
        </div>
      )}
      {items && items.length > 0 && (
        <>
          {note && <div className="text-xs text-mute">{note}</div>}
          <div>
            {items.map((it) => {
              const n = scaled(it);
              return (
                <div key={it.key} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <input
                      className="w-full bg-transparent text-sm font-medium outline-none"
                      value={it.name}
                      onChange={(e) => setItems((x) => x!.map((y) => (y.key === it.key ? { ...y, name: e.target.value } : y)))}
                      aria-label="Namn"
                    />
                    <div className="text-xs text-mute">
                      {kcalStr(n.kcal)} kcal · P {num(n.p, 0)} · K {num(n.c, 0)} · F {num(n.f, 0)}
                    </div>
                  </div>
                  <div className="relative w-24 shrink-0">
                    <input
                      className={`${inputCls} min-h-11 pr-7 text-right text-base`}
                      inputMode="decimal"
                      value={String(it.grams)}
                      onChange={(e) => {
                        const g = parseNum(e.target.value) ?? 0;
                        setItems((x) => x!.map((y) => (y.key === it.key ? { ...y, grams: g } : y)));
                      }}
                      aria-label={`Gram ${it.name}`}
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-mute">g</span>
                  </div>
                  <button onClick={() => setItems((x) => x!.filter((y) => y.key !== it.key))} className="h-11 w-9 shrink-0 text-lg text-mute" aria-label={`Ta bort ${it.name}`}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <Button
            className="w-full"
            onClick={async () => {
              const now = Date.now();
              const recs: FoodLogRec[] = items.map((it, i) => ({
                id: uid(),
                date,
                meal,
                name: it.name.trim() || 'Mat (foto)',
                n: scaled(it),
                amount: { unit: 'g', value: it.grams },
                ref: { kind: 'ai' },
                createdAt: now + i,
              }));
              await db.foodLog.bulkPut(recs);
              toast(`${recs.length} rader loggade i ${MEAL_NAMES[meal].toLowerCase()}`, () => void deleteLogs(recs.map((r) => r.id)));
              onDone();
            }}
          >
            Logga {kcalStr(total)} kcal i {MEAL_NAMES[meal].toLowerCase()}
          </Button>
          <Button kind="ghost" className="w-full" onClick={() => input.current?.click()}>
            Ta ny bild
          </Button>
        </>
      )}
    </div>
  );
}
