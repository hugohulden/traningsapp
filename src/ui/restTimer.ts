/** Vilotimer som tål att appen hamnar i bakgrunden (bygger på sluttid). */
import { useEffect, useRef, useState } from 'react';

const KEY = 'vilotimer';
let audio: AudioContext | null = null;

/** Måste anropas från en användarinteraktion (iOS kräver det för ljud). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audio && AC) audio = new AC();
    if (audio?.state === 'suspended') void audio.resume();
  } catch {
    /* inget ljud */
  }
}

function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.25, 0.5].forEach((d) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
    o.connect(g).connect(audio!.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.2);
  });
}

function alertDone(sound: boolean) {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* iPhone saknar vibration i webben */
  }
  if (sound) beep();
}

function readEnd(): { end: number; total: number } | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeEnd(v: { end: number; total: number } | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignoreras */
  }
}

export function useRestTimer(sound: boolean) {
  const [state, setState] = useState(readEnd);
  const [now, setNow] = useState(Date.now());
  const alerted = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const remaining = state ? Math.ceil((state.end - now) / 1000) : null;
  const finished = remaining != null && remaining <= 0;

  useEffect(() => {
    if (finished && !alerted.current) {
      alerted.current = true;
      // Larma bara om vilan precis tog slut (inte om appen öppnas långt senare).
      if (state && now - state.end < 5000) alertDone(sound);
    }
  }, [finished, now, state, sound]);

  return {
    remaining,
    total: state?.total ?? 0,
    finished,
    start(sec: number) {
      alerted.current = false;
      const v = { end: Date.now() + sec * 1000, total: sec };
      writeEnd(v);
      setState(v);
    },
    add(sec: number) {
      if (!state) return;
      alerted.current = false;
      const v = { end: Math.max(Date.now(), state.end) + sec * 1000, total: state.total + sec };
      writeEnd(v);
      setState(v);
    },
    stop() {
      writeEnd(null);
      setState(null);
    },
  };
}

/** Håll skärmen tänd under passet (iOS 16.4+). */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const req = async () => {
      try {
        lock = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        /* inte tillgängligt */
      }
    };
    void req();
    const vis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}
