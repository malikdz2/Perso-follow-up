import type { Table } from 'dexie';
import { db } from '../db/db';
import { addMonths, daysInMonth, todayISO, pad, parseISO, toISO, type ISODate } from './dates';
import { daycareMonth, unpaidDaycareMonths, withStart } from './budget';
import { loanStatus } from './car';

/** Bornes [début, fin] d'un mois « AAAA-MM ». */
export function monthRange(key: string): [ISODate, ISODate] {
  const [y, m] = key.split('-').map(Number);
  return [`${key}-01`, `${key}-${pad(daysInMonth(y, m - 1))}`];
}

/** Total de TOUTES les dépenses d'un mois (quotidiennes, voiture, crèche, crédit). */
export async function monthSpending(key: string): Promise<number> {
  const [a, b] = monthRange(key);
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  const between = <T extends { date: string }>(t: Table<T, any, any>) => t.where('date').between(a, b, true, true).toArray();

  const [expenses, fuel, maintenance, accessories, misc, daycare, loan, checks, insurances] = await Promise.all([
    between(db.expenses),
    between(db.fuel),
    between(db.maintenance),
    between(db.accessories),
    between(db.carMisc),
    between(db.daycarePayments),
    between(db.loanPayments),
    db.carChecks.filter((c) => c.date >= a && c.date <= b).toArray(),
    db.insurances.filter((i) => i.start >= a && i.start <= b).toArray(),
  ]);
  return (
    sum(expenses, (r) => r.amount) +
    sum(fuel, (r) => r.amount) +
    sum(maintenance, (r) => r.price) +
    sum(accessories, (r) => r.price) +
    sum(misc, (r) => r.amount) +
    sum(daycare, (r) => r.amount) +
    sum(loan, (r) => r.amount) +
    sum(checks, (r) => r.price) +
    sum(insurances, (r) => r.amount)
  );
}

export interface Deadline {
  date: ISODate;
  label: string;
  amount?: number;
}

/** Prochaine date (≥ aujourd'hui) tombant le jour `day` du mois (borné à la fin du mois). */
export function nextMonthlyDate(day: number, from: ISODate = todayISO()): ISODate {
  const d = parseISO(from);
  for (let i = 0; i < 2; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + i;
    const target = new Date(y, m, 1);
    const clamped = Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
    const iso = toISO(new Date(target.getFullYear(), target.getMonth(), clamped));
    if (iso >= from) return iso;
  }
  return from;
}

/** Échéances connues (crédit, crèche…), triées par date. */
export async function upcomingDeadlines(): Promise<Deadline[]> {
  const out: Deadline[] = [];
  const today = todayISO();

  const loan = await db.carLoans.toCollection().first();
  if (loan) {
    const s = loanStatus(loan, await db.loanPayments.where('loanId').equals(loan.id!).toArray(), today);
    // Prochaine mensualité non payée (en retard → affichée à sa date d'échéance).
    if (s.nextDue) out.push({ date: s.nextDue, label: 'Mensualité du crédit voiture', amount: loan.monthly });
  }

  const daycare = await db.daycare.toCollection().first();
  if (daycare) {
    // Premier mois non (entièrement) payé : en retard, en cours, ou à venir.
    const payments = await db.daycarePayments.toArray();
    const label = `Crèche${daycare.name ? ` — ${daycare.name}` : ''}`;
    const late = unpaidDaycareMonths(daycare, payments, today)[0];
    if (late) out.push({ date: late.due, label, amount: daycare.monthly - late.paid });
    else {
      for (let i = 1; i <= 24; i++) {
        const m = daycareMonth(withStart(daycare, payments, today), payments, addMonths(`${today.slice(0, 7)}-01`, i).slice(0, 7), today);
        if (m.status !== 'paye') {
          out.push({ date: m.due, label, amount: daycare.monthly - m.paid });
          break;
        }
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
