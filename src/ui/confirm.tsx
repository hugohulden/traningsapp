/** Egen bekräftelsedialog (webbläsarens confirm() blockeras i vissa inbäddade vyer). */
import { useEffect, useState } from 'react';
import { Button } from './ui';

interface Ask {
  text: string;
  ok: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

let push: ((a: Ask) => void) | null = null;

export function ask(text: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(true);
    push({ text, ok: opts.ok ?? 'OK', danger: opts.danger, resolve });
  });
}

export function ConfirmHost() {
  const [cur, setCur] = useState<Ask | null>(null);
  useEffect(() => {
    push = setCur;
    return () => {
      push = null;
    };
  }, []);
  if (!cur) return null;
  const done = (v: boolean) => {
    cur.resolve(v);
    setCur(null);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => done(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-panel border border-line p-4 safe-bottom">
        <div className="text-base">{cur.text}</div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button kind="ghost" onClick={() => done(false)}>
            Avbryt
          </Button>
          <Button kind={cur.danger ? 'danger' : 'primary'} onClick={() => done(true)}>
            {cur.ok}
          </Button>
        </div>
      </div>
    </div>
  );
}
