// Mises à jour de l'application installée (service worker).
// Sans cela, l'app hors ligne garde l'ancienne version en mémoire jusqu'à ce qu'Android la ferme vraiment.
import { registerSW } from 'virtual:pwa-register';

let registration: ServiceWorkerRegistration | undefined;

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  // Mode « autoUpdate » : dès qu'une nouvelle version est installée, la page se recharge sur celle-ci.
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      // Vérifie les nouveautés au retour dans l'app et toutes les heures (si Internet est disponible).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void reg.update().catch(() => {});
      });
      window.setInterval(() => navigator.onLine && void reg.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
}

export type UpdateCheck = 'a-jour' | 'mise-a-jour' | 'hors-ligne' | 'indisponible';

/** Vérification manuelle (bouton des Réglages). En cas de nouvelle version, l'app se recharge seule. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!('serviceWorker' in navigator)) return 'indisponible';
  if (!navigator.onLine) return 'hors-ligne';
  const reg = registration ?? (await navigator.serviceWorker.getRegistration());
  if (!reg) return 'indisponible';
  try {
    await reg.update();
  } catch {
    return 'hors-ligne';
  }
  return reg.installing || reg.waiting ? 'mise-a-jour' : 'a-jour';
}
