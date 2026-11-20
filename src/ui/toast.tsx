/** Kort bekräftelse längst ner, valfritt med "Ångra". */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface T {
  id: number;
  text: string;
  undo?: () => void;
}

let push: ((t: T) => void) | null = null;
let n = 0;

export function toast(text: string, undo?: () => void) {
  push?.({ id: ++n, text, undo });
}

export function ToastHost() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    push = setT;
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT((x) => (x?.id === t.id ? null : x)), 4000);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[max(env(safe-area-inset-top),12px)]">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-ink px-4 py-3 text-sm text-bg shadow-xl">
        <span className="min-w-0 flex-1">{t.text}</span>
        {t.undo && (
          <button
            className="shrink-0 font-bold underline"
            onClick={() => {
              t.undo!();
              setT(null);
            }}
          >
            Ångra
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
