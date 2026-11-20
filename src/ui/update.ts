/**
 * Uppdateringar av appen. iPhone-appen på hemskärmen fortsätter oftast där den var i stället för
 * att laddas om, och söker då aldrig efter ny version. Därför kollar vi när appen öppnas igen,
 * var 30:e minut och när du trycker på knappen under Mer.
 */
import { registerSW } from 'virtual:pwa-register';

let reg: ServiceWorkerRegistration | undefined;
let reloading = false;

export const BUILD_TIME: string = import.meta.env.VITE_BUILD_TIME ?? '';

export function startUpdates() {
  if (import.meta.env.VITE_NO_SW || !('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      reg = r;
      setInterval(() => void r?.update().catch(() => {}), 30 * 60 * 1000);
    },
  });
  // Ny version tar över → ladda om en gång så att den syns direkt.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reg?.update().catch(() => {});
  });
}

/** Söker efter ny version nu. Svarar 'ny' om en ny version installeras (appen laddas då om). */
export async function checkForUpdate(): Promise<'ny' | 'senaste' | 'fel'> {
  if (!reg) return 'fel';
  try {
    await reg.update();
    if (reg.installing || reg.waiting) return 'ny';
    return 'senaste';
  } catch {
    return 'fel';
  }
}
