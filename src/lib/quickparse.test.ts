import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYWORDS } from '../db/db';
import { matchKeyword, parseQuickEntry } from './quickparse';
import { budgetLevel, daycareMonth, daycareYear, unpaidDaycareMonths } from './budget';

const T = '2026-11-23';
const p = (s: string) => parseQuickEntry(s, DEFAULT_KEYWORDS, T);

describe('Saisie rapide — exemples du cahier des charges', () => {
  it('« 3000 plein » → carburant 3 000 DA', () => {
    expect(p('3000 plein')).toMatchObject({ amount: 3000, target: 'fuel', date: T });
  });
  it('« 1500 courses » → dépense Alimentation', () => {
    expect(p('1500 courses')).toMatchObject({ amount: 1500, target: 'expense:1' });
  });
  it('« crèche 8000 » → crèche (accents facultatifs)', () => {
    expect(p('crèche 8000')).toMatchObject({ amount: 8000, target: 'daycare' });
    expect(p('Creche 8000')).toMatchObject({ amount: 8000, target: 'daycare' });
  });
});

describe('Saisie rapide — variantes', () => {
  it('séparateurs de milliers, « k », « DA »', () => {
    expect(p('12 500 pharmacie').amount).toBe(12500);
    expect(p('12.500 pharmacie').amount).toBe(12500);
    expect(p('1,5k taxi')).toMatchObject({ amount: 1500, target: 'expense:4' });
    expect(p('pain 120 DA')).toMatchObject({ amount: 120, target: 'expense:1' });
  });
  it('kilométrage et litres pour un plein', () => {
    expect(p('plein 3000 40L 36500 km')).toMatchObject({ amount: 3000, liters: 40, km: 36500, target: 'fuel' });
  });
  it('dates : hier, avant-hier, jj/mm', () => {
    expect(p('hier 800 café').date).toBe('2026-11-22');
    expect(p('avant-hier 800 café').date).toBe('2026-11-21');
    expect(p('15/11 2000 lavage')).toMatchObject({ date: '2026-11-15', amount: 2000, target: 'carMisc:lavage' });
  });
  it('le reste de la phrase devient la note', () => {
    expect(p('2500 courses Uno')).toMatchObject({ note: 'courses Uno' });
  });
  it('pluriel / préfixe : « pneus » trouve « pneu »', () => {
    expect(matchKeyword('2 pneus neufs', [{ word: 'pneu', target: 'maintenance' }])?.target).toBe('maintenance');
  });
  it('le mot exact le plus long gagne', () => {
    const kws = [
      { word: 'eau', target: 'expense:2' },
      { word: 'gateau', target: 'expense:1' },
    ];
    expect(matchKeyword('gateau 600', kws)?.target).toBe('expense:1');
  });
  it('aucun mot-clé reconnu', () => {
    const r = p('5000 truc');
    expect(r).toMatchObject({ amount: 5000, note: 'truc' });
    expect(r.target).toBeUndefined();
  });
});

describe('Budgets', () => {
  it('alerte à 80 % et à 100 %', () => {
    expect(budgetLevel(7999, 10000)).toBe('ok');
    expect(budgetLevel(8000, 10000)).toBe('warn');
    expect(budgetLevel(10000, 10000)).toBe('over');
    expect(budgetLevel(5000, 0)).toBe('none');
  });
});

describe('Crèche — statut par mois', () => {
  const dc = { name: 'Les Lutins', monthly: 8000, payDay: 5, startMonth: '2026-09' };
  const pay = (month: string, amount: number, type: 'mensualite' | 'repas' = 'mensualite') => ({ date: `${month}-03`, month, amount, type });

  it('payé, partiel, à payer, en retard, à venir, hors période', () => {
    const pays = [pay('2026-09', 8000), pay('2026-10', 5000), pay('2026-10', 1200, 'repas')];
    const st = (m: string, today = T) => daycareMonth(dc, pays, m, today).status;
    expect(st('2026-08')).toBe('hors');
    expect(st('2026-09')).toBe('paye');
    expect(st('2026-10')).toBe('partiel');
    expect(st('2026-11')).toBe('en_retard'); // échéance le 05/11, nous sommes le 23/11
    expect(st('2026-11', '2026-11-04')).toBe('a_payer');
    expect(st('2026-12')).toBe('a_venir');
    expect(daycareMonth(dc, pays, '2026-10', T)).toMatchObject({ paid: 5000, extras: 1200 });
  });

  it('année complète et rappel des mois impayés', () => {
    expect(daycareYear(dc, [], 2026, T)).toHaveLength(12);
    expect(unpaidDaycareMonths(dc, [pay('2026-09', 8000)], T).map((m) => m.month)).toEqual(['2026-10', '2026-11']);
  });

  it('sans mois de début : rien « en retard » avant le premier paiement ou le mois en cours', () => {
    const { startMonth: _ignored, ...noStart } = dc;
    expect(unpaidDaycareMonths(noStart, [], T).map((m) => m.month)).toEqual(['2026-11']);
    expect(daycareYear(noStart, [], 2026, T)[0].status).toBe('hors');
    expect(unpaidDaycareMonths(noStart, [pay('2026-10', 8000)], T).map((m) => m.month)).toEqual(['2026-11']);
  });

  it('jour de paiement borné à la fin du mois', () => {
    expect(daycareMonth({ ...dc, payDay: 31 }, [], '2027-02', '2027-02-27').due).toBe('2027-02-28');
  });
});
