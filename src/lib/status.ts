import type { DayStatus } from '../db/db';
import { isWeekend, type ISODate } from './dates';

export const STATUS_ORDER: DayStatus[] = ['travail', 'mission', 'conge', 'recup', 'rc', 'absence', 'ferie', 'weekend'];

/** `badge` : étiquette ; `cell` : case du calendrier ; `swatch` : pastille de légende. */
export const STATUS_META: Record<DayStatus, { label: string; badge: string; cell: string; swatch: string }> = {
  travail: {
    label: 'Travail',
    badge: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
    cell: 'bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800',
    swatch: 'bg-white ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-600',
  },
  mission: {
    label: 'Mission',
    badge: 'bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
    cell: 'bg-violet-600 text-white',
    swatch: 'bg-violet-600',
  },
  conge: {
    label: 'Congé',
    badge: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
    cell: 'bg-sky-500 text-white',
    swatch: 'bg-sky-500',
  },
  recup: {
    label: 'Récupération',
    badge: 'bg-teal-200 text-teal-900 dark:bg-teal-900 dark:text-teal-100',
    cell: 'bg-teal-600 text-white',
    swatch: 'bg-teal-600',
  },
  rc: {
    label: 'RC',
    badge: 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
    cell: 'bg-orange-500 text-white',
    swatch: 'bg-orange-500',
  },
  absence: {
    label: 'Absence',
    badge: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
    cell: 'bg-yellow-400 text-yellow-950',
    swatch: 'bg-yellow-400',
  },
  ferie: {
    label: 'Jour férié',
    badge: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
    cell: 'bg-red-500 text-white',
    swatch: 'bg-red-500',
  },
  weekend: {
    label: 'Week-end',
    badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    cell: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    swatch: 'bg-slate-200 dark:bg-slate-800',
  },
};

/** Statut par défaut d'un jour sans saisie (hors jours fériés) : week-end le vendredi/samedi, sinon travail. */
export function defaultStatus(date: ISODate): DayStatus {
  return isWeekend(date) ? 'weekend' : 'travail';
}
