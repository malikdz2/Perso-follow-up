// Jours fériés algériens.
import type { Holiday } from '../db/db';
import { pad, toISO, type ISODate } from './dates';

/** Fêtes civiles à date fixe (confirmées d'office). */
export const FIXED_HOLIDAYS: { md: string; name: string }[] = [
  { md: '01-01', name: 'Nouvel An' },
  { md: '01-12', name: 'Yennayer (Nouvel An amazigh)' },
  { md: '05-01', name: 'Fête du Travail' },
  { md: '07-05', name: "Fête de l'Indépendance" },
  { md: '11-01', name: 'Anniversaire de la Révolution' },
];

/** Fêtes religieuses : [mois hégirien, jour, nom]. */
const RELIGIOUS: [number, number, string][] = [
  [10, 1, 'Aïd el-Fitr (1er jour)'],
  [10, 2, 'Aïd el-Fitr (2e jour)'],
  [12, 10, 'Aïd el-Adha (1er jour)'],
  [12, 11, 'Aïd el-Adha (2e jour)'],
  [1, 1, 'Awal Moharram (Nouvel An hégirien)'],
  [1, 10, 'Achoura'],
  [3, 12, 'Mawlid Ennabaoui'],
];

let hijriFmt: Intl.DateTimeFormat | null | undefined;
function getHijriFormatter(): Intl.DateTimeFormat | null {
  if (hijriFmt !== undefined) return hijriFmt;
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric' });
    hijriFmt = f.resolvedOptions().calendar.startsWith('islamic') ? f : null;
  } catch {
    hijriFmt = null;
  }
  return hijriFmt;
}

/**
 * Dates ESTIMÉES des fêtes religieuses (calendrier Umm al-Qura, calculé hors ligne).
 * L'Algérie suit l'observation de la lune : décalage possible d'un jour → confirmation manuelle.
 */
export function religiousHolidays(year: number): { date: ISODate; name: string }[] {
  const f = getHijriFormatter();
  if (!f) return [];
  const out: { date: ISODate; name: string }[] = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    let month = 0;
    let day = 0;
    for (const p of f.formatToParts(d)) {
      if (p.type === 'month') month = Number(p.value);
      if (p.type === 'day') day = Number(p.value);
    }
    const hit = RELIGIOUS.find(([m, dd]) => m === month && dd === day);
    if (hit) out.push({ date: toISO(d), name: hit[2] });
  }
  return out;
}

/** Jours fériés proposés pour une année (civils confirmés, religieux à confirmer). */
export function holidaysForYear(year: number): Omit<Holiday, 'id'>[] {
  return [
    ...FIXED_HOLIDAYS.map((h) => ({ date: `${year}-${h.md}`, name: h.name, kind: 'civile' as const, confirmed: true })),
    ...religiousHolidays(year).map((h) => ({ ...h, kind: 'religieuse' as const, confirmed: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export const yearOf = (iso: ISODate) => Number(iso.slice(0, 4));
export const isoOf = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
