import { describe, expect, it } from 'vitest';
import type { BalanceMove } from '../db/db';
import { computeBalances } from './balances';
import { countDeducted, dateRange, expectedDayMove, futureAccruals, leaveAccrualsDue, referencePeriod, type RuleSettings } from './rules';
import { holidaysForYear, religiousHolidays } from './holidays';

const OUV: RuleSettings = { leaveCountMode: 'ouvrables', recupRatio: 1 };
const CAL: RuleSettings = { leaveCountMode: 'calendaires', recupRatio: 1 };
const NONE = new Set<string>();

/** Solde de congé = départ 25 j au 23/11/2026 + acquisitions dues à `today`. */
function leaveBalanceAt(today: string): number {
  const moves: BalanceMove[] = [
    { type: 'conge', date: '2026-11-23', days: 25, origin: 'manuel', reason: 'Solde de départ', createdAt: 0 },
    ...leaveAccrualsDue('2026-11-23', today).map((a) => ({ type: 'conge' as const, date: a.date, days: a.days, origin: 'auto' as const, reason: a.reason, createdAt: 0 })),
  ];
  return computeBalances(moves).conge.remaining;
}

describe('Congé — acquisition mensuelle', () => {
  it('aucun ajout avant la fin du mois de départ (23/11/2026 → 25 j)', () => {
    expect(leaveAccrualsDue('2026-11-23', '2026-11-23')).toEqual([]);
    expect(leaveAccrualsDue('2026-11-23', '2026-11-29')).toEqual([]);
    expect(leaveBalanceAt('2026-11-29')).toBe(25);
  });

  it('premier ajout le 30/11/2026 → 27,5 j', () => {
    const due = leaveAccrualsDue('2026-11-23', '2026-11-30');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ date: '2026-11-30', days: 2.5, autoKey: 'conge-acq-2026-11' });
    expect(leaveBalanceAt('2026-11-30')).toBe(27.5);
  });

  it('rattrape tous les mois écoulés même sans ouverture (15/03/2027 → 4 mois → 35 j)', () => {
    const due = leaveAccrualsDue('2026-11-23', '2027-03-15');
    expect(due.map((a) => a.date)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    expect(leaveBalanceAt('2027-03-15')).toBe(35);
  });

  it('dernier jour du mois correct (février bissextile 2028)', () => {
    expect(leaveAccrualsDue('2028-02-10', '2028-02-29').map((a) => a.date)).toEqual(['2028-02-29']);
  });

  it('solde saisi un dernier jour de mois : pas de double ajout ce mois-là', () => {
    expect(leaveAccrualsDue('2026-11-30', '2026-12-31').map((a) => a.date)).toEqual(['2026-12-31']);
  });

  it('30 j par période de référence (1er juillet → 30 juin)', () => {
    const p = referencePeriod('2026-11-23');
    expect(p).toEqual({ start: '2026-07-01', end: '2027-06-30', label: '2026-2027' });
    expect(referencePeriod('2027-06-30').label).toBe('2026-2027');
    expect(referencePeriod('2027-07-01').label).toBe('2027-2028');
    const inPeriod = leaveAccrualsDue('2026-06-30', '2027-06-30');
    expect(inPeriod).toHaveLength(12);
    expect(inPeriod.reduce((s, a) => s + a.days, 0)).toBe(30);
  });

  it('clés uniques par mois (idempotence)', () => {
    const keys = leaveAccrualsDue('2026-11-23', '2029-11-23').map((a) => a.autoKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(36);
  });

  it('planificateur : acquisitions futures jusqu’à une date', () => {
    expect(futureAccruals('2026-11-23', '2027-01-15')).toBe(5);
  });
});

describe('Récupération', () => {
  it('mission un vendredi ou un samedi = +1', () => {
    expect(expectedDayMove('2026-11-27', 'mission', NONE, OUV)).toMatchObject({ type: 'recup', days: 1, reason: 'Mission un vendredi' }); // vendredi
    expect(expectedDayMove('2026-11-28', 'mission', NONE, OUV)).toMatchObject({ type: 'recup', days: 1, reason: 'Mission un samedi' }); // samedi
  });

  it('mission un jour férié (confirmé) en semaine = +1', () => {
    const holidays = new Set(['2026-11-01']); // dimanche 1er novembre
    expect(expectedDayMove('2026-11-01', 'mission', holidays, OUV)).toMatchObject({ type: 'recup', days: 1, reason: 'Mission un jour férié' });
    expect(expectedDayMove('2026-11-01', 'mission', NONE, OUV)).toBeNull(); // non confirmé → jour normal
  });

  it('mission un jour de semaine = 0', () => {
    expect(expectedDayMove('2026-11-24', 'mission', NONE, OUV)).toBeNull(); // mardi
  });

  it('ratio réglable', () => {
    expect(expectedDayMove('2026-11-27', 'mission', NONE, { ...OUV, recupRatio: 1.5 })?.days).toBe(1.5);
    expect(expectedDayMove('2026-11-27', 'mission', NONE, { ...OUV, recupRatio: 2 })?.days).toBe(2);
  });

  it('chaque jour posé « récupération » = −1 (jamais un week-end)', () => {
    expect(expectedDayMove('2026-11-24', 'recup', NONE, OUV)).toMatchObject({ type: 'recup', days: -1 });
    expect(expectedDayMove('2026-11-27', 'recup', NONE, OUV)).toBeNull();
  });

  it('solde : 2 missions de week-end puis 1 récupération posée = 1 j', () => {
    const moves = [
      expectedDayMove('2026-11-27', 'mission', NONE, OUV)!,
      expectedDayMove('2026-11-28', 'mission', NONE, OUV)!,
      expectedDayMove('2026-11-30', 'recup', NONE, OUV)!,
    ].map((m) => ({ ...m, date: '2026-11-27', createdAt: 0 }));
    expect(computeBalances(moves).recup).toEqual({ acquired: 2, taken: 1, remaining: 1 });
  });
});

describe('Congé et RC posés', () => {
  const week = dateRange('2026-11-22', '2026-11-28'); // dimanche → samedi

  it('mode ouvrables : une semaine = 5 jours (vendredi/samedi non décomptés)', () => {
    expect(countDeducted(week, 'conge', NONE, OUV)).toBe(5);
  });

  it('mode ouvrables : un jour férié confirmé n’est pas décompté', () => {
    expect(countDeducted(dateRange('2026-10-29', '2026-11-04'), 'conge', new Set(['2026-11-01']), OUV)).toBe(4);
  });

  it('mode calendaires : une semaine = 7 jours', () => {
    expect(countDeducted(week, 'conge', NONE, CAL)).toBe(7);
  });

  it('RC posé = −1 sur le compteur RC', () => {
    expect(expectedDayMove('2026-11-24', 'rc', NONE, OUV)).toMatchObject({ type: 'rc', days: -1 });
  });
});

describe('Jours fériés algériens', () => {
  it('fêtes civiles fixes confirmées', () => {
    const h = holidaysForYear(2026).filter((x) => x.kind === 'civile');
    expect(h.map((x) => x.date)).toEqual(['2026-01-01', '2026-01-12', '2026-05-01', '2026-07-05', '2026-11-01']);
    expect(h.every((x) => x.confirmed)).toBe(true);
  });

  it('fêtes religieuses proposées (à confirmer)', () => {
    const r = religiousHolidays(2026);
    expect(r.find((x) => x.name.startsWith('Aïd el-Fitr (1er'))?.date).toBe('2026-03-20');
    expect(r.find((x) => x.name.startsWith('Aïd el-Adha (1er'))?.date).toBe('2026-05-27');
    expect(holidaysForYear(2026).filter((x) => x.kind === 'religieuse').every((x) => !x.confirmed)).toBe(true);
  });
});
