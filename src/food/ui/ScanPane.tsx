/**
 * Streckkodsskanner. Använder webbläsarens BarcodeDetector när den finns (Chrome/Android),
 * annars zxing (iOS Safari). Kameran stängs alltid när vyn lämnas eller appen göms.
 */
import { useEffect, useRef, useState } from 'react';
import type { FoodRec } from '../../db/db';
import { Button, inputCls } from '../../ui/ui';
import { lookupBarcode, OffError } from '../store';

type Status = { kind: 'starting' } | { kind: 'scanning' } | { kind: 'looking'; code: string } | { kind: 'error'; text: string; code?: string };

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

interface Detector {
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

export default function ScanPane({ onFound, onNotFound }: { onFound: (f: FoodRec) => void; onNotFound: (barcode: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'starting' });
  const [manual, setManual] = useState('');
  const [run, setRun] = useState(0); // ökas för att starta om kameran
  const cbs = useRef({ onFound, onNotFound });
  cbs.current = { onFound, onNotFound };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const ac = new AbortController();

    const stopCamera = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video.current) video.current.srcObject = null;
    };

    async function handle(code: string) {
      if (stopped) return;
      stopCamera();
      setStatus({ kind: 'looking', code });
      try {
        const r = await lookupBarcode(code, ac.signal);
        if (r.food) cbs.current.onFound(r.food);
        else if (r.offline) setStatus({ kind: 'error', text: `Ingen internetanslutning – kunde inte slå upp ${code}.`, code });
        else cbs.current.onNotFound(code);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setStatus({ kind: 'error', text: e instanceof OffError ? e.message : 'Uppslagningen misslyckades.', code });
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus({ kind: 'error', text: 'Kameran är inte tillgänglig här. Skriv in streckkoden nedan.' });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        const denied = (e as DOMException).name === 'NotAllowedError';
        setStatus({ kind: 'error', text: denied ? 'Appen fick inte använda kameran. Tillåt kameran i inställningarna, eller skriv in streckkoden nedan.' : 'Kunde inte starta kameran. Skriv in streckkoden nedan.' });
        return;
      }
      if (stopped) return stopCamera();
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setStatus({ kind: 'scanning' });

      // Snabb väg: inbyggd BarcodeDetector.
      const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
      const supported = BD ? await BD.getSupportedFormats?.().catch(() => [] as string[]) : [];
      if (BD && supported?.includes('ean_13')) {
        const det = new BD({ formats: FORMATS.filter((f) => supported.includes(f)) });
        const tick = async () => {
          if (stopped) return;
          try {
            const r = await det.detect(v);
            if (r[0]?.rawValue) return void handle(r[0].rawValue);
          } catch {
            /* fortsätt */
          }
          timer = setTimeout(tick, 150);
        };
        void tick();
        return;
      }

      // Annars zxing (laddas bara här).
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
      if (stopped) return;
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
      const controls = await reader.decodeFromStream(stream!, v, (res) => {
        if (res) void handle(res.getText());
      });
      stopZxing = () => controls.stop();
      if (stopped) controls.stop();
    }

    void start();
    const vis = () => document.visibilityState === 'hidden' && stopCamera();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      ac.abort();
      stopCamera();
    };
  }, [run]);

  const submitManual = async () => {
    const code = manual.replace(/\D/g, '');
    if (code.length < 8) return;
    setStatus({ kind: 'looking', code });
    try {
      const r = await lookupBarcode(code);
      if (r.food) onFound(r.food);
      else if (r.offline) setStatus({ kind: 'error', text: `Ingen internetanslutning – kunde inte slå upp ${code}.`, code });
      else onNotFound(code);
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof OffError ? e.message : 'Uppslagningen misslyckades.', code });
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '4 / 3' }}>
        <video ref={video} className="h-full w-full object-cover" playsInline muted autoPlay />
        {status.kind === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/3 w-4/5 rounded-xl border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {status.kind !== 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/90">
            {status.kind === 'starting' && 'Startar kameran…'}
            {status.kind === 'looking' && `Söker ${status.code}…`}
            {status.kind === 'error' && status.text}
          </div>
        )}
      </div>
      {status.kind === 'scanning' && <div className="text-center text-sm text-mute">Håll streckkoden inom ramen.</div>}
      {status.kind === 'error' && (
        <div className="grid grid-cols-2 gap-2">
          <Button kind="soft" onClick={() => (setStatus({ kind: 'starting' }), setRun((x) => x + 1))}>
            Skanna igen
          </Button>
          {status.code ? (
            <Button kind="soft" onClick={() => onNotFound(status.code!)}>
              Lägg in själv
            </Button>
          ) : (
            <span />
          )}
        </div>
      )}
      <div className="flex gap-2">
        <input className={inputCls} inputMode="numeric" placeholder="Eller skriv streckkoden" value={manual} onChange={(e) => setManual(e.target.value)} />
        <Button kind="soft" className="shrink-0" onClick={() => void submitManual()}>
          Sök
        </Button>
      </div>
    </div>
  );
}
