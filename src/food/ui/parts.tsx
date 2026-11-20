/** Små byggstenar för kaloriräknaren. */
import type { ReactNode } from 'react';
import type { Amount, Meal, Nutrients } from '../../db/db';
import { num } from '../../lib/format';
import { MEALS, MEAL_NAMES, unitText } from '../engine';

export function kcalStr(n: number): string {
  return Math.round(n).toLocaleString('sv-SE');
}

export function amountStr(a?: Amount, servingG?: number, unit?: string): string {
  if (!a) return '';
  if (a.unit === 'g') return `${num(a.value, 0)} g`;
  const p = unitText(a.value, unit);
  return servingG ? `${p} (${num(a.value * servingG, 0)} g)` : p;
}

export function macroStr(n: Nutrients): string {
  const parts = [n.p != null ? `P ${num(n.p, 0)}` : '', n.c != null ? `K ${num(n.c, 0)}` : '', n.f != null ? `F ${num(n.f, 0)}` : ''].filter(Boolean);
  return parts.join(' · ');
}

/** Kaloriring: fylls upp mot målet, blir varnings­färgad när man ligger över. */
export function Ring({ eaten, target, children }: { eaten: number; target: number; children: ReactNode }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? eaten / target : 0;
  const over = pct > 1;
  const shown = Math.min(1, pct);
  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-run)" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-panel2)" strokeWidth="12" />
        {shown > 0 && <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={over ? 'var(--color-warn)' : 'url(#ringGrad)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${shown * c} ${c}`}
          style={{ transition: 'stroke-dasharray .4s ease' }}
        />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-sm font-semibold">
        {num(value, 0)}
        <span className="font-normal text-mute"> / {target} g</span>
      </div>
    </div>
  );
}

export function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-2xl bg-panel2 p-1">
      {MEALS.map((m) => (
        <button key={m} onClick={() => onChange(m)} className={`min-h-10 rounded-xl text-xs font-semibold ${m === value ? 'bg-ink text-bg' : 'text-mute'}`}>
          {MEAL_NAMES[m]}
        </button>
      ))}
    </div>
  );
}

/** En rad i en lista med livsmedel eller rätter. */
export function ItemRow({
  title,
  sub,
  right,
  onClick,
  onSide,
  sideLabel,
  tag,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  onClick: () => void;
  onSide?: () => void;
  sideLabel?: string;
  tag?: string;
}) {
  return (
    <div className="flex items-stretch border-b border-line last:border-0">
      <button onClick={onClick} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left active:opacity-70">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {tag && <span className="mr-1.5 rounded bg-panel2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute">{tag}</span>}
            {title}
          </div>
          {sub && <div className="truncate text-xs text-mute">{sub}</div>}
        </div>
        {right && <div className="shrink-0 text-right text-sm">{right}</div>}
      </button>
      {onSide && (
        <button onClick={onSide} className="ml-1 w-11 shrink-0 text-lg text-mute active:text-ink" aria-label={sideLabel}>
          ✎
        </button>
      )}
    </div>
  );
}
