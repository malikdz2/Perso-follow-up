// Règles de calcul des soldes — fonctions PURES (sans base de données), couvertes par les tests.
import type { BalanceType, DayStatus } from '../db/db';
import { addDays, endOfMonth, fmtMonth, isWeekend, parseISO, type ISODate } from './dates';

export const LEAVE_PER_MONTH = 2.5;
export const LEAVE_PER_YEAR = 30;

export type LeaveCountMode = 'ouvrables' | 'calendaires';

export interface RuleSettings {
  leaveCountMode: LeaveCountMode;
  recupRatio: number;
}

// ───────────── Congé : acquisition mensuelle ─────────────

export interface Accrual {
  date: ISODate;
  autoKey: string;
  days: number;
  reason: string;
}

/**
 * Acquisitions de congé dues entre le solde de départ et `today` (inclus) :
 * +2,5 j le DERNIER jour de chaque mois, strictement après la date du solde de départ
 * (un solde saisi le dernier jour d'un mois est réputé inclure l'acquisition de ce mois).
 * Ex. : départ 23/11/2026 → premier ajout le 30/11/2026.
 */
export function leaveAccrualsDue(initDate: ISODate, today: ISODate): Accrual[] {
  const out: Accrual[] = [];
  let monthEnd = endOfMonth(initDate);
  if (monthEnd === initDate) monthEnd = endOfMonth(addDays(initDate, 1));
  while (monthEnd <= today) {
    const key = monthEnd.slice(0, 7);
    out.push({ date: monthEnd, autoKey: `conge-acq-${key}`, days: LEAVE_PER_MONTH, reason: `Acquisition mensuelle — ${fmtMonth(key)}` });
    monthEnd = endOfMonth(addDays(monthEnd, 1));
  }
  return out;
}

/** Acquisitions futures entre `from` (exclu) et `until` (inclus) — pour le planificateur. */
export function futureAccruals(from: ISODate, until: ISODate): number {
  return leaveAccrualsDue(from, until).reduce((s, a) => s + a.days, 0);
}

/** Période de référence du congé : 1er juillet → 30 juin. */
export function referencePeriod(date: ISODate): { start: ISODate; end: ISODate; label: string } {
  const d = parseISO(date);
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return { start: `${y}-07-01`, end: `${y + 1}-06-30`, label: `${y}-${y + 1}` };
}

// ───────────── Calendrier → mouvements ─────────────

/** Jour non travaillé : vendredi, samedi ou jour férié confirmé. */
export function isNonWorking(date: ISODate, holidays: ReadonlySet<ISODate>): boolean {
  return isWeekend(date) || holidays.has(date);
}

export interface ExpectedMove {
  type: BalanceType;
  days: number;
  reason: string;
  origin: 'auto' | 'calendrier';
}

/**
 * Mouvement de solde produit par le statut d'un jour (au plus un par jour) :
 * - congé : −1 (en mode « ouvrables », les week-ends et fériés ne sont pas décomptés) ;
 * - récupération / RC posés : −1 (uniquement un jour travaillé) ;
 * - mission un vendredi, un samedi ou un jour férié : +ratio de récupération.
 */
export function expectedDayMove(
  date: ISODate,
  status: DayStatus,
  holidays: ReadonlySet<ISODate>,
  settings: RuleSettings,
): ExpectedMove | null {
  const off = isNonWorking(date, holidays);
  switch (status) {
    case 'conge':
      if (off && settings.leaveCountMode === 'ouvrables') return null;
      return { type: 'conge', days: -1, reason: 'Congé posé', origin: 'calendrier' };
    case 'recup':
      return off ? null : { type: 'recup', days: -1, reason: 'Récupération posée', origin: 'calendrier' };
    case 'rc':
      return off ? null : { type: 'rc', days: -1, reason: 'RC posé', origin: 'calendrier' };
    case 'mission': {
      if (!off) return null;
      const why = holidays.has(date) ? 'jour férié' : parseISO(date).getDay() === 5 ? 'vendredi' : 'samedi';
      return { type: 'recup', days: settings.recupRatio, reason: `Mission un ${why}`, origin: 'auto' };
    }
    default:
      return null;
  }
}

/** Le statut peut-il être posé ce jour-là ? (sinon le jour est ignoré lors d'une sélection) */
export function canApplyStatus(date: ISODate, status: DayStatus, holidays: ReadonlySet<ISODate>, settings: RuleSettings): boolean {
  if (status === 'recup' || status === 'rc') return !isNonWorking(date, holidays);
  if (status === 'conge' && settings.leaveCountMode === 'ouvrables') return !isNonWorking(date, holidays);
  return true;
}

/** Statut automatique d'un jour sans saisie. */
export function autoStatus(date: ISODate, holidays: ReadonlySet<ISODate>): DayStatus {
  if (holidays.has(date)) return 'ferie';
  return isWeekend(date) ? 'weekend' : 'travail';
}

/** Liste des dates de `start` à `end` incluses. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Nombre de jours décomptés si l'on pose `status` sur ces dates. */
export function countDeducted(dates: ISODate[], status: DayStatus, holidays: ReadonlySet<ISODate>, settings: RuleSettings): number {
  return dates.reduce((n, d) => {
    const m = expectedDayMove(d, status, holidays, settings);
    return n + (m && m.days < 0 ? -m.days : 0);
  }, 0);
}
