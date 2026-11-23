// Missions : enregistrement (avec marquage du calendrier), statistiques par wilaya et par année.
import { db, type Mission, type MissionFeeKind } from '../db/db';
import { diffDays, todayISO, type ISODate } from './dates';
import { syncCalendarMoves } from './engine';
import { dateRange } from './rules';

export const FEE_LABELS: Record<MissionFeeKind, string> = {
  hebergement: 'Hébergement',
  repas: 'Repas',
  carburant: 'Carburant',
  autre: 'Autre',
};

/** Nombre de jours d'une mission (bornes incluses). */
export const missionDays = (m: Pick<Mission, 'start' | 'end'>) => diffDays(m.start, m.end) + 1;

/** Jours de la mission tombant dans l'année `year`. */
export function missionDaysInYear(m: Pick<Mission, 'start' | 'end'>, year: number): number {
  const a = m.start > `${year}-01-01` ? m.start : `${year}-01-01`;
  const b = m.end < `${year}-12-31` ? m.end : `${year}-12-31`;
  return a > b ? 0 : diffDays(a, b) + 1;
}

/** Années proposées : 2025, 2026, 2027 puis les suivantes automatiquement. */
export function availableYears(missions: Pick<Mission, 'start' | 'end'>[], today: ISODate = todayISO()): number[] {
  const last = Math.max(2027, Number(today.slice(0, 4)) + 1, ...missions.map((m) => Number(m.end.slice(0, 4))));
  return Array.from({ length: last - 2025 + 1 }, (_, i) => 2025 + i);
}

export interface WilayaYearStat {
  code: number;
  missions: number;
  days: number;
}

/** Wilayas visitées une année donnée, triées par nombre de jours (décroissant). */
export function wilayaStats(missions: Mission[], year: number): WilayaYearStat[] {
  const map = new Map<number, WilayaYearStat>();
  for (const m of missions) {
    const days = missionDaysInYear(m, year);
    if (!days) continue;
    const s = map.get(m.wilaya) ?? { code: m.wilaya, missions: 0, days: 0 };
    s.missions += 1;
    s.days += days;
    map.set(m.wilaya, s);
  }
  return [...map.values()].sort((a, b) => b.days - a.days || b.missions - a.missions || a.code - b.code);
}

/** Jours d'une mission (hors elle-même) déjà occupés par un autre statut posé à la main. */
export async function conflictingDays(start: ISODate, end: ISODate, missionId?: number) {
  if (!start || !end || start > end) return [];
  const rows = await db.days.where('date').between(start, end, true, true).toArray();
  return rows.filter((d) => d.missionId !== missionId);
}

/**
 * Crée ou modifie une mission et marque ses jours « mission » dans le calendrier
 * (les jours retirés de la mission reviennent au statut automatique), puis recalcule les soldes.
 */
export async function saveMission(data: Omit<Mission, 'id'>, id?: number): Promise<number> {
  const missionId = await db.transaction('rw', db.missions, db.days, async () => {
    let mid: number;
    if (id !== undefined) {
      await db.missions.update(id, data);
      mid = id;
    } else mid = (await db.missions.add(data)) as number;

    const wanted = new Set(dateRange(data.start, data.end));
    const old = await db.days.where('missionId').equals(mid).toArray();
    await db.days.bulkDelete(old.filter((d) => !wanted.has(d.date)).map((d) => d.date));
    await db.days.bulkPut([...wanted].map((date) => ({ date, status: 'mission' as const, missionId: mid })));
    return mid;
  });
  await syncCalendarMoves();
  return missionId;
}

/** Supprime une mission, ses frais et ses jours de calendrier ; détache les dépenses liées. */
export async function deleteMission(id: number): Promise<void> {
  await db.transaction('rw', [db.missions, db.missionFees, db.days, db.expenses, db.fuel, db.carMisc], async () => {
    await db.missions.delete(id);
    await db.missionFees.where('missionId').equals(id).delete();
    await db.days.where('missionId').equals(id).delete();
    const detach = (r: { missionId?: number }) => {
      delete r.missionId;
    };
    await db.expenses.where('missionId').equals(id).modify(detach);
    await db.fuel.where('missionId').equals(id).modify(detach);
    await db.carMisc.where('missionId').equals(id).modify(detach);
  });
  await syncCalendarMoves();
}

/** Mission en cours à une date (pour rattacher automatiquement une dépense — étape 5). */
export async function missionAt(date: ISODate): Promise<Mission | undefined> {
  return db.missions.filter((m) => m.start <= date && m.end >= date).first();
}
