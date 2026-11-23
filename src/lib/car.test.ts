import { describe, expect, it } from 'vitest';
import type { FuelEntry, Maintenance } from '../db/db';
import { checkExpiry, completeFuel, currentKm, expiry, fuelStats, insuranceExpiry, loanStatus, nextOilChange, realCost } from './car';

const fuel = (id: number, date: string, km: number, liters: number, full: boolean, amount = Math.round(liters * 45)): FuelEntry => ({
  id, date, km, liters, full, amount, pricePerLiter: 45,
});

describe('Carburant', () => {
  it('L/100 km entre deux pleins complets', () => {
    const s = fuelStats([fuel(1, '2026-11-01', 10_000, 40, true), fuel(2, '2026-11-10', 10_500, 35, true)]);
    expect(s.perEntry.get(2)).toBe(7); // 35 L / 500 km
    expect(s.perEntry.has(1)).toBe(false); // premier plein : pas de référence
    expect(s.average).toBe(7);
  });

  it('les pleins partiels sont additionnés jusqu’au plein complet suivant', () => {
    const s = fuelStats([
      fuel(1, '2026-11-01', 10_000, 40, true),
      fuel(2, '2026-11-05', 10_300, 15, false),
      fuel(3, '2026-11-10', 10_600, 30, true),
    ]);
    expect(s.perEntry.get(3)).toBe(7.5); // (15 + 30) / 600 km
    expect(s.perEntry.has(2)).toBe(false);
  });

  it('moyenne pondérée sur plusieurs intervalles ; saisies dans le désordre', () => {
    const s = fuelStats([
      fuel(3, '2026-11-20', 11_000, 30, true),
      fuel(1, '2026-11-01', 10_000, 40, true),
      fuel(2, '2026-11-10', 10_500, 35, true),
    ]);
    expect(s.average).toBe(6.5); // (35 + 30) / 1000
  });

  it('coût par km : carburant consommé après le premier relevé / distance', () => {
    const s = fuelStats([fuel(1, '2026-11-01', 10_000, 40, true, 1800), fuel(2, '2026-11-10', 10_500, 35, true, 1575)]);
    expect(s.costPerKm).toBe(3.15); // 1575 DA / 500 km
    expect(s.amount).toBe(3375);
    expect(s.liters).toBe(75);
  });

  it('pas de calcul sans deux pleins complets', () => {
    const s = fuelStats([fuel(1, '2026-11-01', 10_000, 40, false)]);
    expect(s.average).toBeNull();
    expect(s.costPerKm).toBeNull();
  });

  it('complète montant, litres ou prix au litre', () => {
    expect(completeFuel(40, 45.62, NaN)).toEqual({ liters: 40, price: 45.62, amount: 1825 });
    expect(completeFuel(NaN, 45, 3000)).toEqual({ liters: 66.67, price: 45, amount: 3000 });
    expect(completeFuel(50, NaN, 2300)).toEqual({ liters: 50, price: 46, amount: 2300 });
  });
});

describe('Vidange', () => {
  const m = (date: string, type: string, km: number): Maintenance => ({ date, type, km, price: 4000 });

  it('prochaine vidange = km de la dernière vidange + intervalle', () => {
    const list = [m('2026-01-10', 'vidange', 20_000), m('2026-06-10', 'vidange', 29_500), m('2026-07-01', 'pneus', 31_000)];
    const kmNow = currentKm(undefined, [fuel(1, '2026-11-01', 36_200, 40, true)], list);
    expect(kmNow).toBe(36_200);
    expect(nextOilChange(list, 10_000, kmNow)).toEqual({ lastKm: 29_500, lastDate: '2026-06-10', nextKm: 39_500, remaining: 3_300 });
  });

  it('intervalle réglable et dépassement', () => {
    expect(nextOilChange([m('2026-01-10', 'Vidange', 20_000)], 7_500, 28_000)?.remaining).toBe(-500);
    expect(nextOilChange([m('2026-01-10', 'filtres', 20_000)], 10_000, 28_000)).toBeNull();
  });
});

describe('Crédit', () => {
  const loan = { id: 1, amount: 2_000_000, monthly: 60_000, startDate: '2025-02-10', months: 36 };
  const pays = (n: number) => Array.from({ length: n }, (_, i) => ({ loanId: 1, date: `2025-${String(2 + i).padStart(2, '0')}-10`, amount: 60_000 }));

  it('reste à payer, mensualités restantes, progression, coût du crédit', () => {
    const s = loanStatus(loan, pays(10), '2025-11-23');
    expect(s.totalDue).toBe(2_160_000);
    expect(s.paid).toBe(600_000);
    expect(s.remaining).toBe(1_560_000);
    expect(s.remainingCount).toBe(26);
    expect(s.progress).toBeCloseTo(0.2778, 3);
    expect(s.interest).toBe(160_000);
    expect(s.nextDue).toBe('2025-12-10');
    expect(s.paidThisMonth).toBe(true);
    expect(s.overdue).toBe(false);
  });

  it('rappel : mensualité en retard', () => {
    const s = loanStatus(loan, pays(9), '2025-11-23');
    expect(s.nextDue).toBe('2025-11-10');
    expect(s.overdue).toBe(true);
    expect(s.paidThisMonth).toBe(false);
  });

  it('crédit soldé', () => {
    const s = loanStatus({ ...loan, months: 3 }, pays(3), '2025-11-23');
    expect(s.finished).toBe(true);
    expect(s.nextDue).toBeNull();
    expect(s.remaining).toBe(0);
  });
});

describe('Échéances', () => {
  it('assurance : alerte 15 jours avant la fin', () => {
    const ins = (end: string) => [{ company: 'SAA', formula: 'Tous risques', amount: 45_000, start: '2025-12-08', end }];
    expect(insuranceExpiry(ins('2026-12-08'), '2026-11-23')?.level).toBe('soon'); // J-15
    expect(insuranceExpiry(ins('2026-12-09'), '2026-11-23')?.level).toBe('ok'); // J-16
    expect(insuranceExpiry(ins('2026-11-22'), '2026-11-23')?.level).toBe('expired');
  });

  it('contrôle technique : alerte 30 jours avant ; la plus récente échéance compte', () => {
    const checks = [
      { kind: 'controle' as const, date: '2024-12-01', expires: '2025-12-01', price: 2500 },
      { kind: 'controle' as const, date: '2025-12-01', expires: '2026-12-20', price: 2500 },
      { kind: 'vignette' as const, date: '2026-03-01', expires: '2027-03-01', price: 3000 },
    ];
    expect(checkExpiry(checks, 'controle', '2026-11-23')).toMatchObject({ daysLeft: 27, level: 'soon' });
    expect(checkExpiry(checks, 'vignette', '2026-11-23')?.level).toBe('ok');
    expect(expiry('2026-12-23', '2026-11-23', 30).level).toBe('soon');
    expect(expiry('2026-12-24', '2026-11-23', 30).level).toBe('ok');
  });
});

describe('Coût total réel', () => {
  it('achat + toutes les dépenses + intérêts du crédit', () => {
    const c = realCost({
      vehicle: { model: 'Symbol', purchasePrice: 2_900_000, purchaseDate: '2025-01-15', downPayment: 900_000 },
      loan: { amount: 2_000_000, monthly: 60_000, startDate: '2025-02-10', months: 36 },
      fuel: [fuel(1, '2026-11-01', 10_000, 40, true, 1800)],
      maintenance: [{ date: '2026-06-10', type: 'vidange', km: 29_500, price: 4000 }],
      accessories: [{ date: '2026-02-01', item: 'Tapis', price: 2500 }],
      insurances: [{ company: 'SAA', formula: 'TR', amount: 45_000, start: '2025-12-08', end: '2026-12-08' }],
      checks: [{ kind: 'vignette', date: '2026-03-01', expires: '2027-03-01', price: 3000 }],
      misc: [{ date: '2026-11-02', kind: 'lavage', amount: 500 }],
    });
    expect(c.interest).toBe(160_000);
    expect(c.total).toBe(2_900_000 + 160_000 + 1800 + 4000 + 2500 + 45_000 + 3000 + 500);
  });
});
