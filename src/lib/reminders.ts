// Rappels du tableau de bord (et notifications) — fonction PURE, testée.
import type { CarCheck, CarLoan, Category, Daycare, DaycarePayment, Expense, FuelEntry, Insurance, LoanPayment, Maintenance, Recap, ReminderState, Vehicle } from '../db/db';
import { addDays, deMonth, diffDays, fmtDate, fmtMonth, type ISODate } from './dates';
import { fmtDA, fmtNum } from './format';
import { budgetLevel, unpaidDaycareMonths } from './budget';
import { checkExpiry, currentKm, insuranceExpiry, loanStatus, nextOilChange } from './car';

export type ReminderKind = 'creche' | 'credit' | 'assurance' | 'controle' | 'vignette' | 'vidange' | 'budget' | 'recap' | 'sauvegarde';
export type ReminderLevel = 'info' | 'warn' | 'danger';

export interface Reminder {
  /** Clé unique de l'occurrence (pour ne notifier qu'une fois par jour et pouvoir reporter). */
  key: string;
  kind: ReminderKind;
  level: ReminderLevel;
  title: string;
  detail?: string;
  to: string;
}

export interface ReminderInput {
  today: ISODate;
  daycare?: Daycare;
  daycarePayments: DaycarePayment[];
  loan?: CarLoan;
  loanPayments: LoanPayment[];
  insurances: Insurance[];
  checks: CarCheck[];
  vehicle?: Vehicle;
  fuel: FuelEntry[];
  maintenance: Maintenance[];
  oilInterval: number;
  categories: Category[];
  monthExpenses: Expense[];
  recaps: Pick<Recap, 'month' | 'viewedAt'>[];
  lastBackup?: ISODate;
  states: ReminderState[];
}

/** Jours avant l'échéance où l'on commence à rappeler crèche et crédit. */
export const PAYMENT_NOTICE_DAYS = 5;
export const OIL_NOTICE_KM = 1000;
export const BACKUP_EVERY_DAYS = 30;

export function computeReminders(i: ReminderInput): Reminder[] {
  const out: Reminder[] = [];
  const t = i.today;

  // Crèche : mois impayés (dès 5 jours avant l'échéance, puis en retard)
  if (i.daycare) {
    for (const m of unpaidDaycareMonths(i.daycare, i.daycarePayments, t)) {
      const left = diffDays(t, m.due);
      if (left > PAYMENT_NOTICE_DAYS) continue;
      const rest = i.daycare.monthly - m.paid;
      out.push({
        key: `creche-${m.month}`,
        kind: 'creche',
        level: left < 0 ? 'danger' : 'warn',
        title: left < 0 ? `Crèche : ${fmtMonth(m.month)} en retard` : `Crèche : ${fmtMonth(m.month)} à payer`,
        detail: `${fmtDA(rest)} — échéance le ${fmtDate(m.due)}`,
        to: '/creche',
      });
    }
  }

  // Crédit : prochaine mensualité
  if (i.loan) {
    const s = loanStatus(i.loan, i.loanPayments, t);
    if (s.nextDue && !s.finished) {
      const left = diffDays(t, s.nextDue);
      if (left <= PAYMENT_NOTICE_DAYS && !(s.paidThisMonth && left > 0)) {
        out.push({
          key: `credit-${s.nextDue}`,
          kind: 'credit',
          level: left < 0 ? 'danger' : 'warn',
          title: left < 0 ? 'Mensualité du crédit en retard' : 'Mensualité du crédit à payer',
          detail: `${fmtDA(i.loan.monthly)} — échéance le ${fmtDate(s.nextDue)}`,
          to: '/voiture/credit',
        });
      }
    }
  }

  // Assurance (15 j), contrôle technique (30 j), vignette (30 j, rappel annuel)
  const ins = insuranceExpiry(i.insurances, t);
  if (ins && ins.level !== 'ok')
    out.push({
      key: `assurance-${ins.date}`,
      kind: 'assurance',
      level: ins.level === 'expired' ? 'danger' : 'warn',
      title: ins.level === 'expired' ? 'Assurance expirée' : `Assurance : fin dans ${ins.daysLeft} j`,
      detail: `${ins.insurance.company} — jusqu'au ${fmtDate(ins.date)}`,
      to: '/voiture/assurance',
    });
  for (const [kind, label] of [
    ['controle', 'Contrôle technique'],
    ['vignette', 'Vignette'],
  ] as const) {
    const e = checkExpiry(i.checks, kind, t);
    if (e && e.level !== 'ok')
      out.push({
        key: `${kind}-${e.date}`,
        kind,
        level: e.level === 'expired' ? 'danger' : 'warn',
        title: e.level === 'expired' ? `${label} : échéance dépassée` : `${label} : dans ${e.daysLeft} j`,
        detail: `Échéance le ${fmtDate(e.date)}`,
        to: '/voiture/controles',
      });
  }

  // Vidange
  const oil = nextOilChange(i.maintenance, i.oilInterval, currentKm(i.vehicle, i.fuel, i.maintenance));
  if (oil && oil.remaining !== null && oil.remaining <= OIL_NOTICE_KM)
    out.push({
      key: `vidange-${oil.nextKm}`,
      kind: 'vidange',
      level: oil.remaining < 0 ? 'danger' : 'warn',
      title: oil.remaining < 0 ? `Vidange dépassée de ${fmtNum(-oil.remaining)} km` : `Vidange dans ${fmtNum(oil.remaining)} km`,
      detail: `Prévue à ${fmtNum(oil.nextKm)} km`,
      to: '/voiture/entretien',
    });

  // Budgets du mois (80 % / 100 %)
  const month = t.slice(0, 7);
  for (const c of i.categories) {
    const spent = i.monthExpenses.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0);
    const lvl = budgetLevel(spent, c.budget);
    if (lvl === 'warn' || lvl === 'over')
      out.push({
        key: `budget-${c.id}-${month}-${lvl}`,
        kind: 'budget',
        level: lvl === 'over' ? 'danger' : 'warn',
        title: lvl === 'over' ? `Budget ${c.name} dépassé` : `Budget ${c.name} : ${Math.round((spent / c.budget) * 100)} %`,
        detail: `${fmtDA(spent)} sur ${fmtDA(c.budget)}`,
        to: '/depenses',
      });
  }

  // Récapitulatif prêt et pas encore consulté
  const unseen = i.recaps.filter((r) => !r.viewedAt).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (unseen)
    out.push({ key: `recap-${unseen.month}`, kind: 'recap', level: 'info', title: `Récapitulatif ${deMonth(unseen.month)} prêt`, to: `/recap?mois=${unseen.month}` });

  // Sauvegarde tous les 30 jours
  const age = i.lastBackup ? diffDays(i.lastBackup, t) : null;
  if (age === null || age >= BACKUP_EVERY_DAYS)
    out.push({
      key: `sauvegarde-${i.lastBackup ?? 'jamais'}`,
      kind: 'sauvegarde',
      level: 'info',
      title: 'Sauvegarde conseillée',
      detail: age === null ? 'Aucune sauvegarde pour l’instant.' : `Dernière sauvegarde il y a ${age} jours.`,
      to: '/reglages',
    });

  // Rappels reportés (« Plus tard »)
  const snoozed = new Map(i.states.map((s) => [s.key, s.snoozedUntil]));
  const order: Record<ReminderLevel, number> = { danger: 0, warn: 1, info: 2 };
  return out.filter((r) => !(snoozed.get(r.key) && snoozed.get(r.key)! > t)).sort((a, b) => order[a.level] - order[b.level]);
}

/** Report d'un rappel : la sauvegarde 7 jours, le reste jusqu'au lendemain. */
export function snoozeUntil(r: Reminder, today: ISODate): ISODate {
  return addDays(today, r.kind === 'sauvegarde' ? 7 : 1);
}
