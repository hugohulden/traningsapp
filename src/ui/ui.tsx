import { useEffect, type ReactNode } from 'react';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-2xl bg-panel border border-line p-4 ${onClick ? 'active:bg-panel2 cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  );
}

type BtnKind = 'primary' | 'run' | 'ghost' | 'danger' | 'soft';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-accent text-black font-semibold active:brightness-90',
  run: 'bg-run text-black font-semibold active:brightness-90',
  ghost: 'bg-transparent border border-line text-ink active:bg-panel2',
  soft: 'bg-panel2 text-ink active:bg-line',
  danger: 'bg-bad/15 text-bad border border-bad/40 active:bg-bad/25',
};

export function Button({
  children,
  onClick,
  kind = 'primary',
  className = '',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: BtnKind;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`min-h-12 rounded-xl px-4 text-base ${BTN[kind]} disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'mute' }: { children: ReactNode; tone?: 'mute' | 'accent' | 'run' | 'warn' | 'bad' }) {
  const t = {
    mute: 'bg-panel2 text-mute',
    accent: 'bg-accent/15 text-accent',
    run: 'bg-run/15 text-run',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Header({ title, onBack, right, sub }: { title: string; onBack?: () => void; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="safe-top sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-line px-4 pb-3">
      <div className="flex items-center gap-2 min-h-11">
        {onBack && (
          <button onClick={onBack} className="-ml-2 h-11 w-11 rounded-full text-2xl active:bg-panel2" aria-label="Tillbaka">
            ‹
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{title}</h1>
          {sub && <div className="text-sm text-mute">{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[92vh] overflow-y-auto rounded-t-3xl bg-panel border-t border-line safe-bottom">
        <div className="sticky top-0 bg-panel flex items-center justify-between px-4 pt-4 pb-2 z-10">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-panel2 text-lg" aria-label="Stäng">
            ✕
          </button>
        </div>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-mute">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-mute">{hint}</div>}
    </label>
  );
}

export const inputCls = 'w-full min-h-12 rounded-xl bg-panel2 border border-line px-3 text-lg outline-none focus:border-accent';

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-mute">{label}</div>
      <div className="text-xl font-bold truncate">{value}</div>
      {sub && <div className="text-xs text-mute">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-panel2 p-1 gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-10 rounded-lg text-sm font-medium ${o.value === value ? 'bg-ink text-black' : 'text-mute'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'run' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-panel2 overflow-hidden">
      <div className={`h-full rounded-full ${tone === 'run' ? 'bg-run' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
