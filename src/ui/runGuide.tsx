import { useState } from 'react';
import type { RunSpec } from '../engine/planGenerator';
import { runGuide } from '../engine/runGuide';
import { zoneName } from '../engine/running';
import { RUN_TERMS, ZONE_FEEL } from '../plan/config';
import type { AppSettings } from '../plan/settings';

const TERM_NAMES: Record<keyof typeof RUN_TERMS, string> = {
  stegringslopp: 'Stegringslopp',
  uppvarmning: 'Uppvärmning',
  nedjogg: 'Nedjogg',
  jogg: 'Jogg-vila',
  vila: 'Vila',
  test: 'Testlopp',
  lopp: 'Loppet',
  lang: 'Långpass',
};

const DOT = { lugn: 'bg-run', hard: 'bg-warn', vila: 'bg-mute' } as const;

/** "Så gör du": passet steg för steg, med fart, puls och förklaringar. */
export function RunGuideView({ run, settings }: { run: RunSpec; settings: AppSettings }) {
  const [open, setOpen] = useState(false);
  const g = runGuide(run, settings);
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-mute">Så gör du</div>
        <div className="text-xs text-mute">ca {g.totalMin} min</div>
      </div>
      <ol className="mt-1.5 space-y-2">
        {g.steps.map((st, i) => (
          <li key={i} className="flex gap-2.5">
            <div className="flex flex-col items-center pt-1.5">
              <div className={`h-2 w-2 rounded-full ${DOT[st.tone]}`} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{st.title}</div>
              {st.detail && <div className="text-xs text-mute">{st.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      <button className="mt-2 text-sm text-run underline underline-offset-2" onClick={() => setOpen((x) => !x)}>
        {open ? 'Dölj förklaringar' : 'Vad betyder det?'}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-panel2 p-3 text-sm">
          {g.terms.map((t) => (
            <p key={t}>
              <span className="font-semibold">{TERM_NAMES[t]}: </span>
              {RUN_TERMS[t]}
            </p>
          ))}
          {g.zones.map((z) => (
            <p key={z}>
              <span className="font-semibold">{zoneName(z)}: </span>
              {ZONE_FEEL[z]}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
