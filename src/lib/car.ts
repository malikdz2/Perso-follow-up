// Calculs du module Voiture — fonctions PURES, couvertes par les tests.
import type { Accessory, CarCheck, CarLoan, CarMisc, FuelEntry, Insurance, LoanPayment, Maintenance, Vehicle } from '../db/db';
import { addMonths, diffDays, monthKey, type ISODate } from './dates';

export const MAINTENANCE_TYPES = ['vidange', 'filtres', 'pneus', 'plaquettes', 'batterie', 'courroie', 'révision', 'carrosserie', 'autre'];
export const MISC_LABELS: Record<CarMisc['kind'], string> = {
  lavage: 'Lavage',
  parking: 'Parking',
  amende: 'Amende',
  peage: 'Péage',
  autre: 'Autre',
};
export const CHECK_LABELS: Record<CarCheck['kind'], string> = { controle: 'Contrôle technique', vignette: 'Vignette' };
export const INSURANCE_ALERT_DAYS = 15;
export const CHECK_ALERT_DAYS = 30;

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ───────────── Carburant ─────────────

export interface FuelStats {
  /** L/100 km calculé pour chaque plein complet (id → valeur). */
  perEntry: Map<number, number>;
  /** Moyenne sur tous les intervalles plein complet → plein complet. */
  average: number | null;
  /** Coût carburant par km (DA/km) entre le premier et le dernier relevé. */
  costPerKm: number | null;
  distance: number;
  liters: number;
  amount: number;
}

/**
 * Consommation : entre deux pleins COMPLETS, on additionne les litres mis après le premier
 * (pleins partiels compris) et on divise par la distance parcourue.
 */
export function fuelStats(entries: FuelEntry[]): FuelStats {
  const sorted = entries.filter((e) => e.km > 0).sort((a, b) => a.km - b.km || a.date.localeCompare(b.date));
  const perEntry = new Map<number, number>();
  let lastFull: FuelEntry | null = null;
  let litersSince = 0;
  let totalL = 0;
  let totalKm = 0;
  for (const e of sorted) {
    if (lastFull) litersSince += e.liters;
    if (e.full) {
      if (lastFull && e.km > lastFull.km) {
        const d = e.km - lastFull.km;
        if (e.id !== undefined) perEntry.set(e.id, round((litersSince / d) * 100));
        totalL += litersSince;
        totalKm += d;
      }
      lastFull = e;
      litersSince = 0;
    }
  }
  const distance = sorted.length > 1 ? sorted[sorted.length - 1].km - sorted[0].km : 0;
  // Le carburant du premier relevé a servi AVANT la période mesurée : on ne le compte pas.
  const costAfterFirst = sum(sorted.slice(1), (e) => e.amount);
  return {
    perEntry,
    average: totalKm > 0 ? round((totalL / totalKm) * 100) : null,
    costPerKm: distance > 0 ? round(costAfterFirst / distance) : null,
    distance,
    liters: round(sum(entries, (e) => e.liters)),
    amount: sum(entries, (e) => e.amount),
  };
}

/** Complète litres / prix au litre / montant à partir des deux autres valeurs. */
export function completeFuel(liters: number, price: number, amount: number): { liters: number; price: number; amount: number } {
  if (liters > 0 && price > 0 && !(amount > 0)) return { liters, price, amount: Math.round(liters * price) };
  if (amount > 0 && price > 0 && !(liters > 0)) return { liters: round(amount / price), price, amount };
  if (amount > 0 && liters > 0 && !(price > 0)) return { liters, price: round(amount / liters), amount };
  return { liters, price, amount };
}

// ───────────── Kilométrage et vidange ─────────────

export function currentKm(vehicle: Vehicle | undefined, fuel: FuelEntry[], maintenance: Maintenance[]): number | null {
  const kms = [vehicle?.initialKm ?? 0, ...fuel.map((f) => f.km ?? 0), ...maintenance.map((m) => m.km ?? 0)].filter((k) => k > 0);
  return kms.length ? Math.max(...kms) : null;
}

export interface OilChange {
  lastKm: number;
  lastDate: ISODate;
  nextKm: number;
  /** km restants avant la prochaine vidange (négatif = dépassé) ; null si km actuel inconnu. */
  remaining: number | null;
}

/** Prochaine vidange = km de la dernière vidange + intervalle (10 000 km par défaut). */
export function nextOilChange(maintenance: Maintenance[], interval: number, kmNow: number | null): OilChange | null {
  const last = maintenance
    .filter((m) => m.type.toLowerCase() === 'vidange' && (m.km ?? 0) > 0)
    .sort((a, b) => b.km! - a.km! || b.date.localeCompare(a.date))[0];
  if (!last) return null;
  const nextKm = last.km! + interval;
  return { lastKm: last.km!, lastDate: last.date, nextKm, remaining: kmNow !== null ? nextKm - kmNow : null };
}

// ───────────── Crédit ─────────────

export interface LoanStatus {
  totalDue: number;
  paid: number;
  remaining: number;
  paidCount: number;
  remainingCount: number;
  /** 0 → 1 */
  progress: number;
  /** Coût du crédit = total remboursé − montant emprunté. */
  interest: number;
  nextDue: ISODate | null;
  /** Mensualité du mois en cours déjà payée ? */
  paidThisMonth: boolean;
  overdue: boolean;
  finished: boolean;
}

export function loanStatus(loan: CarLoan, payments: LoanPayment[], today: ISODate): LoanStatus {
  const totalDue = loan.monthly * loan.months;
  const paid = sum(payments, (p) => p.amount);
  const paidCount = Math.min(loan.months, payments.length);
  const remaining = Math.max(0, totalDue - paid);
  const finished = paidCount >= loan.months || remaining === 0;
  const nextDue = finished ? null : addMonths(loan.startDate, paidCount);
  return {
    totalDue,
    paid,
    remaining,
    paidCount,
    remainingCount: Math.max(0, loan.months - paidCount),
    progress: totalDue > 0 ? Math.min(1, paid / totalDue) : 0,
    interest: Math.max(0, totalDue - loan.amount),
    nextDue,
    paidThisMonth: payments.some((p) => monthKey(p.date) === monthKey(today)),
    overdue: nextDue !== null && nextDue < today,
    finished,
  };
}

// ───────────── Échéances (assurance, contrôle technique, vignette) ─────────────

export type ExpiryLevel = 'ok' | 'soon' | 'expired';
export interface Expiry {
  date: ISODate;
  daysLeft: number;
  level: ExpiryLevel;
}

export function expiry(end: ISODate, today: ISODate, alertDays: number): Expiry {
  const daysLeft = diffDays(today, end);
  return { date: end, daysLeft, level: daysLeft < 0 ? 'expired' : daysLeft <= alertDays ? 'soon' : 'ok' };
}

/** Assurance en vigueur = celle qui se termine le plus tard. Alerte 15 jours avant la fin. */
export function insuranceExpiry(insurances: Insurance[], today: ISODate): (Expiry & { insurance: Insurance }) | null {
  const latest = [...insurances].sort((a, b) => b.end.localeCompare(a.end))[0];
  return latest ? { ...expiry(latest.end, today, INSURANCE_ALERT_DAYS), insurance: latest } : null;
}

/** Dernier contrôle technique / vignette. Alerte 30 jours avant l'échéance. */
export function checkExpiry(checks: CarCheck[], kind: CarCheck['kind'], today: ISODate): (Expiry & { check: CarCheck }) | null {
  const latest = checks.filter((c) => c.kind === kind).sort((a, b) => b.expires.localeCompare(a.expires))[0];
  return latest ? { ...expiry(latest.expires, today, CHECK_ALERT_DAYS), check: latest } : null;
}

// ───────────── Coût total réel ─────────────

export interface RealCost {
  purchase: number;
  interest: number;
  fuel: number;
  maintenance: number;
  accessories: number;
  insurance: number;
  checks: number;
  misc: number;
  total: number;
}

/**
 * Coût total réel = prix d'achat + toutes les dépenses voiture
 * (+ coût du crédit : les mensualités remboursent l'achat, seuls les intérêts s'ajoutent).
 */
export function realCost(d: {
  vehicle?: Vehicle;
  loan?: CarLoan;
  fuel: FuelEntry[];
  maintenance: Maintenance[];
  accessories: Accessory[];
  insurances: Insurance[];
  checks: CarCheck[];
  misc: CarMisc[];
}): RealCost {
  const c = {
    purchase: d.vehicle?.purchasePrice ?? 0,
    interest: d.loan ? Math.max(0, d.loan.monthly * d.loan.months - d.loan.amount) : 0,
    fuel: sum(d.fuel, (r) => r.amount),
    maintenance: sum(d.maintenance, (r) => r.price),
    accessories: sum(d.accessories, (r) => r.price),
    insurance: sum(d.insurances, (r) => r.amount),
    checks: sum(d.checks, (r) => r.price),
    misc: sum(d.misc, (r) => r.amount),
  };
  return { ...c, total: Object.values(c).reduce((a, b) => a + b, 0) };
}
