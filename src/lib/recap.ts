// Récapitulatif de fin de mois : calcul PUR (testé) + génération automatique et figée en base.
import { db, type BalanceMove, type CarCheck, type CarLoan, type CarMisc, type Accessory, type Category, type DayEntry, type DaycarePayment, type Expense, type FuelEntry, type Insurance, type LoanPayment, type Maintenance, type Mission } from '../db/db';
import { WILAYA_BY_CODE } from '../data/wilayas';
import { addMonths, endOfMonth, todayISO, type ISODate } from './dates';
import { computeBalances } from './balances';
import { fuelStats, loanStatus } from './car';
import { autoStatus, dateRange } from './rules';
import { monthRange } from './spending';
import type { DayStatus } from '../db/db';

export interface RecapData {
  month: string;
  expenses: { total: number; byCategory: { name: string; color: string; amount: number }[] };
  car: { fuelAmount: number; fuelLiters: number; consumption: number | null; maintenance: number; other: number; loanPaid: number; loanRemaining: number | null; total: number };
  daycare: { paid: number; monthlyPaid: boolean | null };
  work: { worked: number; mission: number; conge: number; recup: number; rc: number; absence: number; ferie: number; wilayas: { code: number; name: string; days: number }[] };
  balances: { conge: number; recup: number; rc: number };
  /** Toutes les dépenses du mois (quotidiennes + voiture + crèche + crédit). */
  grandTotal: number;
}

export interface RecapInput {
  categories: Category[];
  expenses: Expense[];
  fuel: FuelEntry[]; // tous les pleins (pour la consommation)
  maintenance: Maintenance[];
  accessories: Accessory[];
  misc: CarMisc[];
  insurances: Insurance[];
  checks: CarCheck[];
  loan?: CarLoan;
  loanPayments: LoanPayment[];
  daycareMonthly?: number;
  daycarePayments: DaycarePayment[];
  days: DayEntry[];
  holidays: Set<ISODate>;
  missions: Mission[];
  moves: BalanceMove[];
}

const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

export function computeRecap(month: string, i: RecapInput): RecapData {
  const [a, b] = monthRange(month);
  const inM = <T extends { date: string }>(rows: T[]) => rows.filter((r) => inRange(r.date, a, b));

  const exp = inM(i.expenses);
  const byCategory = i.categories
    .map((c) => ({ name: c.name, color: c.color, amount: sum(exp.filter((e) => e.categoryId === c.id), (e) => e.amount) }))
    .filter((c) => c.amount > 0)
    .sort((x, y) => y.amount - x.amount);

  const fuelMonth = inM(i.fuel);
  const stats = fuelStats(i.fuel.filter((f) => f.date <= b));
  const cons = fuelMonth.map((f) => stats.perEntry.get(f.id!)).filter((v): v is number => v !== undefined);
  const maintenance = sum(inM(i.maintenance), (r) => r.price);
  const other = sum(inM(i.accessories), (r) => r.price) + sum(inM(i.misc), (r) => r.amount) + sum(inM(i.checks), (r) => r.price) + sum(i.insurances.filter((r) => inRange(r.start, a, b)), (r) => r.amount);
  const loanPaid = sum(inM(i.loanPayments), (r) => r.amount);
  const loanRemaining = i.loan ? loanStatus(i.loan, i.loanPayments.filter((p) => p.date <= b), b).remaining : null;
  const fuelAmount = sum(fuelMonth, (r) => r.amount);

  const dayMap = new Map(i.days.map((d) => [d.date, d]));
  const count: Partial<Record<DayStatus, number>> = {};
  const wilayaDays = new Map<number, number>();
  const missionById = new Map(i.missions.map((m) => [m.id!, m]));
  for (const d of dateRange(a, b)) {
    const e = dayMap.get(d);
    const st = e?.status ?? autoStatus(d, i.holidays);
    count[st] = (count[st] ?? 0) + 1;
    if (st === 'mission') {
      const m = e?.missionId !== undefined ? missionById.get(e.missionId) : i.missions.find((x) => x.start <= d && x.end >= d);
      if (m) wilayaDays.set(m.wilaya, (wilayaDays.get(m.wilaya) ?? 0) + 1);
    }
  }
  const bal = computeBalances(i.moves.filter((m) => m.date <= b));
  const daycarePaid = sum(i.daycarePayments.filter((p) => p.month === month), (p) => p.amount);
  const daycareMonthlyPaid = i.daycareMonthly ? sum(i.daycarePayments.filter((p) => p.month === month && p.type === 'mensualite'), (p) => p.amount) >= i.daycareMonthly : null;
  const daycareSpent = sum(inM(i.daycarePayments), (p) => p.amount);

  const total = sum(exp, (e) => e.amount);
  const carTotal = fuelAmount + maintenance + other;
  return {
    month,
    expenses: { total, byCategory },
    car: {
      fuelAmount,
      fuelLiters: Math.round(sum(fuelMonth, (f) => f.liters) * 100) / 100,
      consumption: cons.length ? Math.round((cons.reduce((s, c) => s + c, 0) / cons.length) * 100) / 100 : null,
      maintenance,
      other,
      loanPaid,
      loanRemaining,
      total: carTotal,
    },
    daycare: { paid: daycarePaid, monthlyPaid: daycareMonthlyPaid },
    work: {
      worked: count.travail ?? 0,
      mission: count.mission ?? 0,
      conge: count.conge ?? 0,
      recup: count.recup ?? 0,
      rc: count.rc ?? 0,
      absence: count.absence ?? 0,
      ferie: count.ferie ?? 0,
      wilayas: [...wilayaDays.entries()].map(([code, days]) => ({ code, name: WILAYA_BY_CODE.get(code)?.name ?? '?', days })).sort((x, y) => y.days - x.days),
    },
    balances: { conge: bal.conge.remaining, recup: bal.recup.remaining, rc: bal.rc.remaining },
    grandTotal: total + carTotal + loanPaid + daycareSpent,
  };
}

export interface Delta {
  diff: number;
  pct: number | null;
  dir: 'up' | 'down' | 'same';
}

/** Comparaison avec le mois précédent : flèche, écart et pourcentage. */
export function delta(current: number | null | undefined, previous: number | null | undefined): Delta | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = Math.round((current - previous) * 100) / 100;
  return { diff, pct: previous ? Math.round((diff / previous) * 1000) / 10 : null, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' };
}

/** Mois dont le récap doit être (re)généré : mois terminés non figés depuis `start`, + le mois en cours si c'est son dernier jour. */
export function monthsToGenerate(start: string, today: ISODate, existing: Map<string, boolean>): string[] {
  const current = today.slice(0, 7);
  const out: string[] = [];
  for (let m = start; m < current; m = addMonths(`${m}-01`, 1).slice(0, 7)) if (!existing.get(m)) out.push(m);
  if (today === endOfMonth(today) && !existing.get(current)) out.push(current);
  return out;
}

// ───────────── Base de données ─────────────

export async function gatherRecapInput(): Promise<RecapInput> {
  const [categories, expenses, fuel, maintenance, accessories, misc, insurances, checks, loan, loanPayments, daycare, daycarePayments, days, holidays, missions, moves] = await Promise.all([
    db.categories.orderBy('order').toArray(),
    db.expenses.toArray(),
    db.fuel.toArray(),
    db.maintenance.toArray(),
    db.accessories.toArray(),
    db.carMisc.toArray(),
    db.insurances.toArray(),
    db.carChecks.toArray(),
    db.carLoans.toCollection().first(),
    db.loanPayments.toArray(),
    db.daycare.toCollection().first(),
    db.daycarePayments.toArray(),
    db.days.toArray(),
    db.holidays.filter((h) => h.confirmed).toArray(),
    db.missions.toArray(),
    db.balanceMoves.toArray(),
  ]);
  return {
    categories, expenses, fuel, maintenance, accessories, misc, insurances, checks, loan, loanPayments,
    daycareMonthly: daycare?.monthly, daycarePayments, days, holidays: new Set(holidays.map((h) => h.date)), missions, moves,
  };
}

/** Premier mois suivi : celui de l'installation (solde de départ). */
async function firstMonth(today: ISODate): Promise<string> {
  const init = await db.balanceMoves.where('autoKey').equals('init-conge').first();
  const created = init ? new Date(init.createdAt) : new Date();
  const m = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
  return m < today.slice(0, 7) ? m : today.slice(0, 7);
}

/**
 * Génère les récaps manquants : le dernier jour du mois (provisoire, mis à jour à chaque ouverture ce jour-là),
 * puis figé définitivement à la première ouverture qui suit. Renvoie les mois générés.
 */
export async function ensureRecaps(today: ISODate = todayISO()): Promise<string[]> {
  const existing = new Map((await db.recaps.toArray()).map((r) => [r.month, r.final]));
  const todo = monthsToGenerate(await firstMonth(today), today, existing);
  if (!todo.length) return [];
  const input = await gatherRecapInput();
  for (const month of todo) {
    const prev = await db.recaps.get(month);
    await db.recaps.put({ month, createdAt: Date.now(), final: month < today.slice(0, 7), viewedAt: prev?.viewedAt, data: computeRecap(month, input) });
  }
  return todo;
}

/** Récap d'un mois quelconque (figé s'il existe, sinon calculé à la volée). */
export async function recapFor(month: string): Promise<{ data: RecapData; final: boolean; stored: boolean }> {
  const r = await db.recaps.get(month);
  if (r) return { data: r.data as RecapData, final: r.final, stored: true };
  return { data: computeRecap(month, await gatherRecapInput()), final: false, stored: false };
}

export const previousMonth = (m: string) => addMonths(`${m}-01`, -1).slice(0, 7);
