import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Baby, Bell, CalendarClock, ChartColumn, CreditCard, Download, Droplets, ShieldCheck, Wallet, X, type LucideIcon } from 'lucide-react';
import { computeReminders, type ReminderKind } from '../lib/reminders';
import { gatherReminderInput, snooze } from '../lib/notify';
import { exportBackup } from '../lib/backup';
import { cx } from '../lib/cx';

const ICONS: Record<ReminderKind, LucideIcon> = {
  creche: Baby,
  credit: CreditCard,
  assurance: ShieldCheck,
  controle: CalendarClock,
  vignette: CalendarClock,
  vidange: Droplets,
  budget: Wallet,
  recap: ChartColumn,
  sauvegarde: Download,
};
const LEVEL = {
  danger: 'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900',
  warn: 'bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900',
  info: 'bg-sky-50 text-sky-950 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900',
};

/** Rappels du tableau de bord : crèche, crédit, assurance, contrôle technique, vignette, vidange, budget, récap, sauvegarde. */
export function RemindersList() {
  const reminders = useLiveQuery(async () => computeReminders(await gatherReminderInput()));
  if (!reminders) return null;
  return (
    <section aria-label="Rappels" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <Bell className="size-4" /> Rappels {reminders.length > 0 && <span className="rounded-full bg-slate-200 px-2 text-xs dark:bg-slate-800">{reminders.length}</span>}
      </h2>
      {reminders.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">✓ Rien à signaler.</p>
      ) : (
        reminders.map((r) => {
          const Icon = ICONS[r.kind];
          return (
            <div key={r.key} className={cx('flex items-center gap-2 rounded-2xl py-1 pr-1 pl-3 ring-1', LEVEL[r.level])}>
              <Icon className="size-5 shrink-0 opacity-80" />
              <Link to={r.to} className="min-h-12 min-w-0 flex-1 py-1.5">
                <p className="font-semibold">{r.title}</p>
                {r.detail && <p className="text-sm opacity-80">{r.detail}</p>}
              </Link>
              {r.kind === 'sauvegarde' && (
                <button type="button" aria-label="Sauvegarder maintenant" onClick={() => void exportBackup()} className="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-black/10">
                  <Download className="size-5" />
                </button>
              )}
              <button type="button" aria-label={`Plus tard : ${r.title}`} title="Plus tard" onClick={() => void snooze(r)} className="flex size-11 shrink-0 items-center justify-center rounded-full opacity-60 active:bg-black/10">
                <X className="size-5" />
              </button>
            </div>
          );
        })
      )}
    </section>
  );
}
