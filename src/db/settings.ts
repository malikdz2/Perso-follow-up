import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

export interface AppSettings {
  onboarded: boolean;
  /** Décompte du congé : jours ouvrables (hors week-end/fériés) ou calendaires. */
  leaveCountMode: 'ouvrables' | 'calendaires';
  /** Jours de récupération gagnés par jour de mission travaillé un week-end ou férié. */
  recupRatio: number;
  /** Intervalle entre deux vidanges (km). */
  oilInterval: number;
  /** Date ISO de la dernière sauvegarde JSON. */
  lastBackup?: string;
  notificationsEnabled: boolean;
  /** Années dont les jours fériés ont déjà été pré-remplis. */
  holidayYears: number[];
  /** Identité affichée sur les notes de frais. */
  fullName?: string;
  jobTitle?: string;
  employer?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboarded: false,
  leaveCountMode: 'ouvrables',
  recupRatio: 1,
  oilInterval: 10_000,
  notificationsEnabled: false,
  holidayYears: [],
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db.settings.put({ key, value });
}

/** Réglages réactifs (undefined pendant le premier chargement). */
export function useSettings(): AppSettings | undefined {
  return useLiveQuery(getSettings);
}
