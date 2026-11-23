// Rappels : collecte des données, notifications système (si autorisées), report « Plus tard ».
import { db } from '../db/db';
import { getSettings, setSetting } from '../db/settings';
import { todayISO } from './dates';
import { monthRange } from './spending';
import { computeReminders, snoozeUntil, type Reminder, type ReminderInput } from './reminders';

export async function gatherReminderInput(today = todayISO()): Promise<ReminderInput> {
  const [a, b] = monthRange(today.slice(0, 7));
  const s = await getSettings();
  const [daycare, daycarePayments, loan, loanPayments, insurances, checks, vehicle, fuel, maintenance, categories, monthExpenses, recaps, states] = await Promise.all([
    db.daycare.toCollection().first(),
    db.daycarePayments.toArray(),
    db.carLoans.toCollection().first(),
    db.loanPayments.toArray(),
    db.insurances.toArray(),
    db.carChecks.toArray(),
    db.vehicle.toCollection().first(),
    db.fuel.toArray(),
    db.maintenance.toArray(),
    db.categories.toArray(),
    db.expenses.where('date').between(a, b, true, true).toArray(),
    db.recaps.toArray(),
    db.reminders.toArray(),
  ]);
  return {
    today, daycare, daycarePayments, loan, loanPayments: loan ? loanPayments.filter((p) => p.loanId === loan.id) : [], insurances, checks, vehicle, fuel, maintenance,
    oilInterval: s.oilInterval, categories, monthExpenses, recaps: recaps.map((r) => ({ month: r.month, viewedAt: r.viewedAt })), lastBackup: s.lastBackup, states,
  };
}

export async function currentReminders(): Promise<Reminder[]> {
  return computeReminders(await gatherReminderInput());
}

export async function snooze(r: Reminder) {
  const prev = await db.reminders.get(r.key);
  await db.reminders.put({ ...prev, key: r.key, snoozedUntil: snoozeUntil(r, todayISO()) });
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

/** Demande l'autorisation ; renvoie vrai si les notifications sont autorisées. */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  // requestPermission renvoie immédiatement la décision déjà prise, ou affiche la demande.
  const perm = await Notification.requestPermission();
  const ok = perm === 'granted';
  await setSetting('notificationsEnabled', ok);
  return ok;
}

/**
 * Affiche une notification pour chaque rappel pas encore notifié aujourd'hui.
 * (Sans serveur, les notifications partent quand l'app est ouverte ou revient au premier plan.)
 */
export async function notifyDueReminders(): Promise<number> {
  const s = await getSettings();
  if (!s.notificationsEnabled || !notificationsSupported() || Notification.permission === 'default') return 0;
  const today = todayISO();
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 0;
  let n = 0;
  for (const r of await currentReminders()) {
    const st = await db.reminders.get(r.key);
    if (st?.lastNotified === today) continue;
    try {
      await reg.showNotification(r.title, {
        body: r.detail,
        tag: r.key,
        icon: './pwa-192.png',
        badge: './pwa-192.png',
        data: { url: `./#${r.to}` },
      });
    } catch {
      return n; // autorisation retirée entre-temps
    }
    await db.reminders.put({ ...st, key: r.key, lastNotified: today });
    n++;
  }
  return n;
}
