import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, type Category } from '../db/db';
import { computeReminders, snoozeUntil, type ReminderInput } from './reminders';
import { computeRecap, delta, monthsToGenerate, type RecapInput } from './recap';
import { toCSV } from './csv';

const T = '2026-11-23';
const cats: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 }));
const base: ReminderInput = {
  today: T, daycarePayments: [], loanPayments: [], insurances: [], checks: [], fuel: [], maintenance: [], oilInterval: 10_000,
  categories: cats, monthExpenses: [], recaps: [], lastBackup: '2026-11-20', states: [],
};
const kinds = (i: Partial<ReminderInput>) => computeReminders({ ...base, ...i }).map((r) => `${r.kind}:${r.level}`);

describe('Rappels', () => {
  it('rien à signaler', () => {
    expect(kinds({})).toEqual([]);
  });

  it('crèche : à partir de 5 jours avant l’échéance, puis en retard', () => {
    const daycare = { name: 'Lutins', monthly: 8000, payDay: 5, startMonth: '2026-11' };
    expect(kinds({ daycare, today: '2026-11-04' })).toEqual(['creche:warn']);
    expect(kinds({ daycare, today: '2026-11-23' })).toEqual(['creche:danger']);
    expect(kinds({ daycare: { ...daycare, payDay: 30 }, today: '2026-11-23' })).toEqual([]); // J-7
    expect(kinds({ daycare, daycarePayments: [{ date: '2026-11-02', month: '2026-11', amount: 8000, type: 'mensualite' }] })).toEqual([]);
  });

  it('crédit : mensualité proche ou en retard', () => {
    const loan = { id: 1, amount: 100_000, monthly: 10_000, startDate: '2026-10-25', months: 12 };
    const paid = [{ loanId: 1, date: '2026-10-25', amount: 10_000 }];
    expect(kinds({ loan, loanPayments: paid })).toEqual(['credit:warn']); // 25/11 dans 2 j
    expect(kinds({ loan, loanPayments: [] })).toEqual(['credit:danger']); // 25/10 non payée
  });

  it('assurance 15 j, contrôle technique 30 j, vignette, vidange 1 000 km', () => {
    expect(kinds({ insurances: [{ company: 'SAA', formula: 'TR', amount: 1, start: '2025-12-01', end: '2026-12-05' }] })).toEqual(['assurance:warn']);
    expect(kinds({ checks: [{ kind: 'controle', date: '2025-12-01', expires: '2026-12-20', price: 1 }] })).toEqual(['controle:warn']);
    expect(kinds({ checks: [{ kind: 'vignette', date: '2025-03-01', expires: '2026-03-01', price: 1 }] })).toEqual(['vignette:danger']);
    expect(kinds({ maintenance: [{ date: '2026-01-01', type: 'vidange', km: 30_000, price: 1 }], fuel: [{ date: T, km: 39_200, liters: 1, pricePerLiter: 1, amount: 1, full: true }] })).toEqual(['vidange:warn']);
  });

  it('budget dépassé, récap prêt, sauvegarde', () => {
    const c = cats.map((x) => (x.id === 1 ? { ...x, budget: 10_000 } : x));
    expect(kinds({ categories: c, monthExpenses: [{ date: T, amount: 10_500, categoryId: 1 }] })).toEqual(['budget:danger']);
    expect(kinds({ recaps: [{ month: '2026-10' }] })).toEqual(['recap:info']);
    expect(kinds({ recaps: [{ month: '2026-10', viewedAt: 1 }] })).toEqual([]);
    expect(kinds({ lastBackup: undefined })).toEqual(['sauvegarde:info']);
    expect(kinds({ lastBackup: '2026-10-24' })).toEqual(['sauvegarde:info']); // 30 j
    expect(kinds({ lastBackup: '2026-10-25' })).toEqual([]);
  });

  it('report : masqué jusqu’à la date choisie ; tri par gravité', () => {
    const r = computeReminders({ ...base, lastBackup: undefined })[0];
    expect(snoozeUntil(r, T)).toBe('2026-11-30');
    expect(computeReminders({ ...base, lastBackup: undefined, states: [{ key: r.key, snoozedUntil: '2026-11-30' }] })).toEqual([]);
    const lv = computeReminders({ ...base, lastBackup: undefined, checks: [{ kind: 'vignette', date: '2025-03-01', expires: '2026-03-01', price: 1 }] }).map((x) => x.level);
    expect(lv).toEqual(['danger', 'info']);
  });
});

describe('Récapitulatif mensuel', () => {
  const input: RecapInput = {
    categories: cats,
    expenses: [
      { date: '2026-11-02', amount: 3000, categoryId: 1 },
      { date: '2026-11-10', amount: 1000, categoryId: 3 },
      { date: '2026-10-10', amount: 9999, categoryId: 1 },
    ],
    fuel: [
      { id: 1, date: '2026-10-30', km: 10_000, liters: 40, pricePerLiter: 45, amount: 1800, full: true },
      { id: 2, date: '2026-11-15', km: 10_500, liters: 35, pricePerLiter: 45, amount: 1575, full: true },
    ],
    maintenance: [{ date: '2026-11-20', type: 'vidange', km: 10_500, price: 4500 }],
    accessories: [], misc: [{ date: '2026-11-03', kind: 'lavage', amount: 500 }], insurances: [], checks: [],
    loan: { id: 1, amount: 100_000, monthly: 10_000, startDate: '2026-10-10', months: 12 },
    loanPayments: [{ loanId: 1, date: '2026-10-10', amount: 10_000 }, { loanId: 1, date: '2026-11-10', amount: 10_000 }, { loanId: 1, date: '2026-12-10', amount: 10_000 }],
    daycareMonthly: 8000,
    daycarePayments: [{ date: '2026-11-03', month: '2026-11', amount: 8000, type: 'mensualite' }],
    days: [
      { date: '2026-11-04', status: 'mission', missionId: 1 },
      { date: '2026-11-05', status: 'mission', missionId: 1 },
      { date: '2026-11-17', status: 'conge' },
    ],
    holidays: new Set(['2026-11-01']),
    missions: [{ id: 1, start: '2026-11-04', end: '2026-11-05', wilaya: 31, place: '', reason: '', reimbursed: 0 }],
    moves: [
      { type: 'conge', date: '2026-11-01', days: 25, origin: 'manuel', reason: '', createdAt: 0 },
      { type: 'conge', date: '2026-11-17', days: -1, origin: 'calendrier', reason: '', createdAt: 0 },
      { type: 'conge', date: '2026-12-31', days: 2.5, origin: 'auto', reason: '', createdAt: 0 },
    ],
  };
  const r = computeRecap('2026-11', input);

  it('dépenses totales et par catégorie', () => {
    expect(r.expenses.total).toBe(4000);
    expect(r.expenses.byCategory).toEqual([
      { name: 'Alimentation', color: '#16a34a', amount: 3000 },
      { name: 'Santé', color: '#dc2626', amount: 1000 },
    ]);
  });

  it('voiture : carburant DA et litres, L/100, entretien, crédit restant à la fin du mois', () => {
    expect(r.car).toMatchObject({ fuelAmount: 1575, fuelLiters: 35, consumption: 7, maintenance: 4500, other: 500, loanPaid: 10_000, loanRemaining: 100_000 });
  });

  it('crèche, travail (jours travaillés, mission, wilayas), soldes à la fin du mois', () => {
    expect(r.daycare).toEqual({ paid: 8000, monthlyPaid: true });
    // novembre 2026 : 30 j, 8 vendredis/samedis, 1er novembre férié (dimanche) → 21 jours ouvrés − 2 mission − 1 congé
    expect(r.work).toMatchObject({ worked: 18, mission: 2, conge: 1, ferie: 1, wilayas: [{ code: 31, name: 'Oran', days: 2 }] });
    expect(r.balances.conge).toBe(24); // l'acquisition du 31/12 n'est pas comptée
    expect(r.grandTotal).toBe(4000 + 1575 + 4500 + 500 + 10_000 + 8000);
  });

  it('comparaison avec le mois précédent : flèche, écart, %', () => {
    expect(delta(4000, 9999)).toEqual({ diff: -5999, pct: -60, dir: 'down' });
    expect(delta(1500, 1000)).toEqual({ diff: 500, pct: 50, dir: 'up' });
    expect(delta(100, 0)).toEqual({ diff: 100, pct: null, dir: 'up' });
    expect(delta(5, null)).toBeNull();
  });

  it('génération : mois terminés non figés + dernier jour du mois en cours', () => {
    expect(monthsToGenerate('2026-09', '2026-11-23', new Map([['2026-09', true]]))).toEqual(['2026-10']);
    expect(monthsToGenerate('2026-11', '2026-11-30', new Map())).toEqual(['2026-11']); // dernier jour : provisoire
    expect(monthsToGenerate('2026-11', '2026-12-01', new Map([['2026-11', false]]))).toEqual(['2026-11']); // figé à l'ouverture suivante
    expect(monthsToGenerate('2026-11', '2026-12-01', new Map([['2026-11', true]]))).toEqual([]);
  });
});

describe('CSV', () => {
  it('séparateur ;, virgule décimale, guillemets, BOM', () => {
    const csv = toCSV(['Date', 'Montant', 'Note'], [['01/11/2026', 45.62, 'a;b "c"'], ['02/11/2026', 3000, undefined]]);
    expect(csv).toBe('﻿Date;Montant;Note\r\n01/11/2026;45,62;"a;b ""c"""\r\n02/11/2026;3000;\r\n');
  });
});
