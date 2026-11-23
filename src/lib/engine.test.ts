import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { setSetting } from '../db/settings';
import { computeBalances } from './balances';
import { ensureLeaveAccruals, runStartupTasks, setDaysStatus, syncCalendarMoves } from './engine';
import { dateRange } from './rules';

async function balances() {
  return computeBalances(await db.balanceMoves.toArray());
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.balanceMoves.bulkAdd([
    { type: 'conge', date: '2026-11-23', days: 25, origin: 'manuel', reason: 'Solde de départ', autoKey: 'init-conge', createdAt: 0 },
    { type: 'recup', date: '2026-11-23', days: 0, origin: 'manuel', reason: 'Solde de départ', autoKey: 'init-recup', createdAt: 0 },
    { type: 'rc', date: '2026-11-23', days: 2, origin: 'manuel', reason: 'Solde de départ', autoKey: 'init-rc', createdAt: 0 },
  ]);
});

describe('Acquisition du congé en base', () => {
  it('ajoute les mois manquants au démarrage, sans jamais doubler', async () => {
    expect(await ensureLeaveAccruals('2026-11-23')).toBe(0);
    expect((await balances()).conge.remaining).toBe(25);

    expect(await ensureLeaveAccruals('2026-11-30')).toBe(1);
    expect((await balances()).conge.remaining).toBe(27.5);

    // Ré-ouverture le même jour : rien de plus
    expect(await ensureLeaveAccruals('2026-11-30')).toBe(0);
    // App non ouverte pendant 3 mois : rattrapage
    expect(await ensureLeaveAccruals('2027-02-28')).toBe(3);
    expect((await balances()).conge.remaining).toBe(35);
  });

  it('retire les acquisitions antérieures si la date de départ est déplacée', async () => {
    await ensureLeaveAccruals('2027-01-31'); // nov, déc, jan
    const init = await db.balanceMoves.where('autoKey').equals('init-conge').first();
    await db.balanceMoves.update(init!.id!, { date: '2026-12-31' });
    await ensureLeaveAccruals('2027-01-31');
    const keys = (await db.balanceMoves.where('autoKey').startsWith('conge-acq-').toArray()).map((m) => m.autoKey);
    expect(keys).toEqual(['conge-acq-2027-01']);
  });
});

describe('Calendrier → soldes', () => {
  it('poser une semaine de congé (ouvrables) retire 5 jours, réinitialiser les rend', async () => {
    const r = await setDaysStatus(dateRange('2026-12-06', '2026-12-12'), 'conge');
    expect(r).toEqual({ applied: 5, skipped: 2 });
    expect((await balances()).conge.remaining).toBe(20);
    await setDaysStatus(dateRange('2026-12-06', '2026-12-12'), null);
    expect((await balances()).conge.remaining).toBe(25);
  });

  it('mission un vendredi/samedi → +1 récup ; poser une récup → −1', async () => {
    await setDaysStatus(['2026-12-04', '2026-12-05', '2026-12-06'], 'mission'); // ven, sam, dim
    expect((await balances()).recup.remaining).toBe(2);
    await setDaysStatus(['2026-12-08'], 'recup');
    expect((await balances()).recup).toEqual({ acquired: 2, taken: 1, remaining: 1 });
  });

  it('changement du ratio ou confirmation d’un férié : recalcul automatique', async () => {
    await setDaysStatus(['2026-12-04', '2026-12-07'], 'mission'); // vendredi + lundi
    await setSetting('recupRatio', 2);
    await syncCalendarMoves();
    expect((await balances()).recup.remaining).toBe(2);
    await db.holidays.add({ date: '2026-12-07', name: 'Test', kind: 'religieuse', confirmed: true });
    await syncCalendarMoves();
    expect((await balances()).recup.remaining).toBe(4);
  });

  it('RC posé = −1 sur le compteur RC uniquement', async () => {
    await setDaysStatus(['2026-12-08'], 'rc');
    const b = await balances();
    expect(b.rc.remaining).toBe(1);
    expect(b.conge.remaining).toBe(25);
  });

  it('démarrage : fériés pré-remplis une seule fois, tâches idempotentes', async () => {
    await runStartupTasks('2026-12-01');
    await runStartupTasks('2026-12-01');
    const h2026 = await db.holidays.where('date').between('2026-01-01', '2026-12-31', true, true).toArray();
    expect(h2026.filter((h) => h.kind === 'civile')).toHaveLength(5);
    expect((await balances()).conge.remaining).toBe(27.5);
  });
});
