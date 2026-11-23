// Moteur des soldes côté base : applique les règles pures de rules.ts à IndexedDB.
// Toutes les opérations sont idempotentes (relancées sans risque à chaque ouverture).
import { db, type BalanceMove, type DayStatus } from '../db/db';
import { getSettings, setSetting } from '../db/settings';
import { todayISO, type ISODate } from './dates';
import { holidaysForYear } from './holidays';
import { WILAYA_BY_CODE } from '../data/wilayas';
import { autoStatus, canApplyStatus, expectedDayMove, leaveAccrualsDue } from './rules';

/** Dates des jours fériés CONFIRMÉS. */
export async function confirmedHolidaySet(): Promise<Set<ISODate>> {
  const rows = await db.holidays.filter((h) => h.confirmed).toArray();
  return new Set(rows.map((h) => h.date));
}

/** Pré-remplit les jours fériés d'une année (une seule fois par année). */
export async function ensureHolidays(year: number): Promise<void> {
  await db.transaction('rw', db.holidays, db.settings, async () => {
    const settings = await getSettings();
    if (settings.holidayYears.includes(year)) return;
    const existing = new Set((await db.holidays.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray()).map((h) => `${h.date}|${h.name}`));
    await db.holidays.bulkAdd(holidaysForYear(year).filter((h) => !existing.has(`${h.date}|${h.name}`)));
    await setSetting('holidayYears', [...settings.holidayYears, year].sort());
  });
}

/**
 * Ajoute les acquisitions mensuelles de congé manquantes jusqu'à aujourd'hui
 * (même si l'app n'a pas été ouverte) et retire celles antérieures au solde de départ.
 */
export async function ensureLeaveAccruals(today: ISODate = todayISO()): Promise<number> {
  return db.transaction('rw', db.balanceMoves, async () => {
    const init = await db.balanceMoves.where('autoKey').equals('init-conge').first();
    const existing = await db.balanceMoves.where('autoKey').startsWith('conge-acq-').toArray();
    if (!init) {
      await db.balanceMoves.bulkDelete(existing.map((m) => m.id!));
      return 0;
    }
    const due = leaveAccrualsDue(init.date, today);
    const dueKeys = new Set(due.map((a) => a.autoKey));
    // Acquisitions devenues invalides (date de départ modifiée)
    const stale = existing.filter((m) => !dueKeys.has(m.autoKey!) && m.date <= init.date);
    await db.balanceMoves.bulkDelete(stale.map((m) => m.id!));
    const have = new Set(existing.map((m) => m.autoKey));
    const missing = due.filter((a) => !have.has(a.autoKey));
    const now = Date.now();
    await db.balanceMoves.bulkAdd(
      missing.map((a) => ({ type: 'conge' as const, date: a.date, days: a.days, origin: 'auto' as const, reason: a.reason, autoKey: a.autoKey, createdAt: now })),
    );
    return missing.length;
  });
}

/**
 * Recalcule les mouvements issus du calendrier (clé « cal-AAAA-MM-JJ », un au plus par jour)
 * à partir des statuts des jours, des jours fériés confirmés et des réglages.
 */
export async function syncCalendarMoves(): Promise<void> {
  const settings = await getSettings();
  await db.transaction('rw', [db.days, db.holidays, db.balanceMoves, db.missions], async () => {
    const holidays = await confirmedHolidaySet();
    const days = await db.days.toArray();
    const missions = new Map((await db.missions.toArray()).map((m) => [m.id!, m]));
    const expected = new Map<string, Omit<BalanceMove, 'id' | 'createdAt'>>();
    for (const d of days) {
      const m = expectedDayMove(d.date, d.status, holidays, settings);
      if (!m) continue;
      const mission = d.missionId !== undefined ? missions.get(d.missionId) : undefined;
      const reason = mission ? `${m.reason} — ${WILAYA_BY_CODE.get(mission.wilaya)?.name ?? 'mission'}` : m.reason;
      expected.set(`cal-${d.date}`, { ...m, reason, date: d.date, autoKey: `cal-${d.date}` });
    }
    const existing = await db.balanceMoves.where('autoKey').startsWith('cal-').toArray();
    const now = Date.now();
    for (const e of existing) {
      const want = expected.get(e.autoKey!);
      if (!want) await db.balanceMoves.delete(e.id!);
      else {
        if (want.type !== e.type || want.days !== e.days || want.reason !== e.reason || want.origin !== e.origin || want.date !== e.date) {
          await db.balanceMoves.update(e.id!, want);
        }
        expected.delete(e.autoKey!);
      }
    }
    await db.balanceMoves.bulkAdd([...expected.values()].map((m) => ({ ...m, createdAt: now })));
  });
}

export interface ApplyResult {
  applied: number;
  skipped: number;
}

/**
 * Change le statut de plusieurs jours (null = revenir au statut automatique),
 * puis met les soldes à jour. Les jours où le statut n'a pas de sens sont ignorés
 * (ex. : récupération un vendredi, congé un jour férié en mode ouvrables).
 */
export async function setDaysStatus(dates: ISODate[], status: DayStatus | null, note?: string): Promise<ApplyResult> {
  const settings = await getSettings();
  const holidays = await confirmedHolidaySet();
  let applied = 0;
  let skipped = 0;
  await db.transaction('rw', db.days, async () => {
    for (const date of dates) {
      const cur = await db.days.get(date);
      // Les jours rattachés à une mission se gèrent depuis le module Missions.
      if (cur?.missionId !== undefined) skipped++;
      else if (status === null || status === autoStatus(date, holidays)) {
        await db.days.delete(date);
        applied++;
      } else if (canApplyStatus(date, status, holidays, settings)) {
        await db.days.put({ ...cur, date, status, note: note ?? cur?.note });
        applied++;
      } else skipped++;
    }
  });
  await syncCalendarMoves();
  return { applied, skipped };
}

let running: Promise<void> | null = null;

/** Tâches lancées à chaque ouverture de l'app (et au retour au premier plan). Jamais deux en parallèle. */
export function runStartupTasks(today: ISODate = todayISO()): Promise<void> {
  running ??= (async () => {
    try {
      const y = Number(today.slice(0, 4));
      for (const year of [y - 1, y, y + 1]) await ensureHolidays(year);
      await ensureLeaveAccruals(today);
      await syncCalendarMoves();
      // Récapitulatif de fin de mois (import dynamique : évite une dépendance circulaire).
      const { ensureRecaps } = await import('./recap');
      await ensureRecaps(today);
    } finally {
      running = null;
    }
  })();
  return running;
}
