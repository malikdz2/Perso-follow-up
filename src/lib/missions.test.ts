import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Mission } from '../db/db';
import { computeBalances } from './balances';
import { setDaysStatus } from './engine';
import { availableYears, deleteMission, missionDaysInYear, saveMission, wilayaStats } from './missions';

const base = { place: 'Siège', reason: 'Audit', reimbursed: 0 };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('Missions → calendrier et récupérations', () => {
  it('créer une mission marque ses jours ; vendredi/samedi donnent des récupérations', async () => {
    const id = await saveMission({ ...base, start: '2026-12-02', end: '2026-12-06', wilaya: 31 }); // mer → dim
    const days = await db.days.where('missionId').equals(id).toArray();
    expect(days.map((d) => d.date)).toEqual(['2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(days.every((d) => d.status === 'mission')).toBe(true);
    const moves = await db.balanceMoves.toArray();
    expect(computeBalances(moves).recup.remaining).toBe(2);
    expect(moves.map((m) => m.reason)).toContain('Mission un vendredi — Oran');
  });

  it('modifier les dates libère les jours retirés ; supprimer remet tout à zéro', async () => {
    const id = await saveMission({ ...base, start: '2026-12-02', end: '2026-12-06', wilaya: 31 });
    await saveMission({ ...base, start: '2026-12-02', end: '2026-12-03', wilaya: 31 }, id);
    expect(await db.days.count()).toBe(2);
    expect(computeBalances(await db.balanceMoves.toArray()).recup.remaining).toBe(0);
    await deleteMission(id);
    expect(await db.days.count()).toBe(0);
    expect(await db.missions.count()).toBe(0);
  });

  it('un jour de mission ne peut pas être changé depuis le calendrier', async () => {
    await saveMission({ ...base, start: '2026-12-02', end: '2026-12-02', wilaya: 16 });
    expect(await setDaysStatus(['2026-12-02'], 'conge')).toEqual({ applied: 0, skipped: 1 });
  });
});

describe('Statistiques par wilaya', () => {
  const ms = [
    { id: 1, start: '2026-03-01', end: '2026-03-03', wilaya: 16 },
    { id: 2, start: '2026-05-10', end: '2026-05-10', wilaya: 16 },
    { id: 3, start: '2026-12-30', end: '2027-01-02', wilaya: 31 },
    { id: 4, start: '2025-06-01', end: '2025-06-05', wilaya: 59 },
  ].map((m) => ({ ...base, ...m })) as Mission[];

  it('jours par année (mission à cheval sur deux années)', () => {
    expect(missionDaysInYear(ms[2], 2026)).toBe(2);
    expect(missionDaysInYear(ms[2], 2027)).toBe(2);
  });

  it('wilayas visitées triées par jours', () => {
    expect(wilayaStats(ms, 2026)).toEqual([
      { code: 16, missions: 2, days: 4 },
      { code: 31, missions: 1, days: 2 },
    ]);
    expect(wilayaStats(ms, 2025)).toEqual([{ code: 59, missions: 1, days: 5 }]);
  });

  it('années : 2025 → 2027 puis les suivantes automatiquement', () => {
    expect(availableYears([], '2026-11-23')).toEqual([2025, 2026, 2027]);
    expect(availableYears([], '2027-03-01')).toEqual([2025, 2026, 2027, 2028]);
    expect(availableYears([{ start: '2029-01-01', end: '2029-01-02' }], '2026-11-23')).toEqual([2025, 2026, 2027, 2028, 2029]);
  });
});
