// Budgets mensuels par catégorie et statut de la crèche — fonctions PURES, testées.
import type { Daycare, DaycarePayment } from '../db/db';
import { addMonths, daysInMonth, pad, type ISODate } from './dates';

export type BudgetLevel = 'none' | 'ok' | 'warn' | 'over';

/** Alerte à 80 % (warn) et à 100 % (over). Budget 0 = pas de budget. */
export function budgetLevel(spent: number, budget: number): BudgetLevel {
  if (!budget) return 'none';
  const r = spent / budget;
  return r >= 1 ? 'over' : r >= 0.8 ? 'warn' : 'ok';
}

export type DaycareMonthStatus = 'paye' | 'partiel' | 'a_payer' | 'en_retard' | 'a_venir' | 'hors';

export interface DaycareMonth {
  month: string; // AAAA-MM
  due: ISODate; // date de paiement prévue
  paid: number; // mensualités payées pour ce mois
  extras: number; // autres frais (inscription, repas…) rattachés à ce mois
  status: DaycareMonthStatus;
}

/** Date de paiement du mois (jour borné à la fin du mois). */
export function daycareDueDate(month: string, payDay: number): ISODate {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(Math.min(payDay, daysInMonth(y, m - 1)))}`;
}

/**
 * Statut payé / à payer d'un mois :
 * payé si les mensualités du mois couvrent la mensualité, partiel sinon ; à payer à partir du mois en cours,
 * en retard après le jour de paiement ; à venir pour les mois futurs ; hors période avant le début.
 */
export function daycareMonth(daycare: Daycare, payments: DaycarePayment[], month: string, today: ISODate): DaycareMonth {
  const ofMonth = payments.filter((p) => p.month === month);
  const paid = ofMonth.filter((p) => p.type === 'mensualite').reduce((s, p) => s + p.amount, 0);
  const extras = ofMonth.filter((p) => p.type !== 'mensualite').reduce((s, p) => s + p.amount, 0);
  const due = daycareDueDate(month, daycare.payDay);
  let status: DaycareMonthStatus;
  if (daycare.startMonth && month < daycare.startMonth && paid === 0) status = 'hors';
  else if (paid >= daycare.monthly && daycare.monthly > 0) status = 'paye';
  else if (paid > 0) status = 'partiel';
  else if (month > today.slice(0, 7)) status = 'a_venir';
  else status = today > due ? 'en_retard' : 'a_payer';
  return { month, due, paid, extras, status };
}

/** Crèche sans mois de début : on part du premier paiement enregistré, sinon du mois en cours. */
export function withStart(daycare: Daycare, payments: DaycarePayment[], today: ISODate): Daycare {
  if (daycare.startMonth) return daycare;
  const first = payments.map((p) => p.month).sort()[0];
  const current = today.slice(0, 7);
  return { ...daycare, startMonth: first && first < current ? first : current };
}

/** Les 12 mois d'une année. */
export function daycareYear(daycare: Daycare, payments: DaycarePayment[], year: number, today: ISODate): DaycareMonth[] {
  daycare = withStart(daycare, payments, today);
  return Array.from({ length: 12 }, (_, i) => daycareMonth(daycare, payments, `${year}-${pad(i + 1)}`, today));
}

/** Mois non payés jusqu'au mois en cours (pour le rappel). */
export function unpaidDaycareMonths(daycare: Daycare, payments: DaycarePayment[], today: ISODate, lookback = 12): DaycareMonth[] {
  daycare = withStart(daycare, payments, today);
  const out: DaycareMonth[] = [];
  for (let i = lookback - 1; i >= 0; i--) {
    const month = addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7);
    const m = daycareMonth(daycare, payments, month, today);
    if (m.status === 'a_payer' || m.status === 'en_retard' || m.status === 'partiel') out.push(m);
  }
  return out;
}
