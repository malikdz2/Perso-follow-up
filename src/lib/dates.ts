// Toutes les dates sont stockées en chaîne ISO locale « AAAA-MM-JJ » (pas de fuseau horaire)
// et affichées au format JJ/MM/AAAA.

export type ISODate = string;

export const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
export const MONTHS_SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** AAAA-MM-JJ → JJ/MM/AAAA */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** « lundi 23/11/2026 » */
export function fmtLongDate(iso: ISODate): string {
  return `${DAYS_FR[parseISO(iso).getDay()]} ${fmtDate(iso)}`;
}

/** Clé de mois « AAAA-MM » */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

/** « AAAA-MM » → « novembre 2026 » */
export function fmtMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** « de novembre 2026 » / « d'octobre 2026 » (élision devant voyelle). */
export function deMonth(key: string): string {
  const m = fmtMonth(key);
  return /^[aeiouéèh]/i.test(m) ? `d'${m}` : `de ${m}`;
}

/** Dernier jour du mois contenant `iso`. */
export function endOfMonth(iso: ISODate): ISODate {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth())));
}

/** Ajoute n mois en gardant le jour (borné au dernier jour du mois). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const day = Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return toISO(new Date(target.getFullYear(), target.getMonth(), day));
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Clé du mois précédent « AAAA-MM ». */
export function prevMonthKey(key: string): string {
  return monthKey(addMonths(`${key}-01`, -1));
}

/** Nombre de jours entre deux dates (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** Vendredi (5) et samedi (6) = week-end en Algérie. */
export function isWeekend(iso: ISODate): boolean {
  const wd = parseISO(iso).getDay();
  return wd === 5 || wd === 6;
}
