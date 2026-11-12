/** Ljust/mörkt läge. Valet sparas i inställningarna och speglas i localStorage för att undvika blink vid start. */
import { useEffect, useState } from 'react';
import { setChartTheme } from './charts';

export type ThemePref = 'auto' | 'dark' | 'light';
const KEY = 'tema';
const BG = { dark: '#0b0f14', light: '#f3f5f8' };

function systemLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  return pref === 'auto' ? (systemLight() ? 'light' : 'dark') : pref;
}

export function applyTheme(pref: ThemePref): 'dark' | 'light' {
  const t = resolveTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[t]);
  setChartTheme(t);
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* privat läge */
  }
  return t;
}

/** Körs före första renderingen. */
export function applyStoredTheme() {
  let pref: ThemePref = 'auto';
  try {
    pref = (localStorage.getItem(KEY) as ThemePref) || 'auto';
  } catch {
    /* ignorera */
  }
  applyTheme(pref);
}

/** Håller temat i synk med inställningen och telefonens läge. Returnerar aktuellt tema. */
export function useTheme(pref: ThemePref | undefined): 'dark' | 'light' {
  const [t, setT] = useState<'dark' | 'light'>(() => resolveTheme(pref ?? 'auto'));
  useEffect(() => {
    const p = pref ?? 'auto';
    setT(applyTheme(p));
    if (p !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setT(applyTheme('auto'));
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  return t;
}
