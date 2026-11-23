import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, CalendarClock, Minus } from 'lucide-react';
import { db } from '../db/db';
import { computeBalances } from '../lib/balances';
import { fmtDate, fmtLongDate, deMonth, monthKey, prevMonthKey, todayISO } from '../lib/dates';
import { fmtDA, fmtDays, pctChange } from '../lib/format';
import { monthSpending, upcomingDeadlines } from '../lib/spending';
import { defaultStatus, STATUS_META } from '../lib/status';
import { MODULES } from '../components/modules';
import { Card } from '../components/ui';
import { RemindersList } from '../components/RemindersList';
import { cx } from '../lib/cx';

function useDashboard() {
  return useLiveQuery(async () => {
    const today = todayISO();
    const month = monthKey(today);
    const [current, previous, moves, day, holiday, deadlines] = await Promise.all([
      monthSpending(month),
      monthSpending(prevMonthKey(month)),
      db.balanceMoves.toArray(),
      db.days.get(today),
      db.holidays.where('date').equals(today).filter((h) => h.confirmed).first(),
      upcomingDeadlines(),
    ]);
    const status = day?.status ?? (holiday ? 'ferie' : defaultStatus(today));
    return { today, month, current, previous, balances: computeBalances(moves), status, deadlines };
  });
}

export default function Home() {
  const data = useDashboard();
  const navigate = useNavigate();
  if (!data) return null;

  const pct = pctChange(data.current, data.previous);
  const delta = data.current - data.previous;
  const next = data.deadlines[0];

  return (
    <div className="space-y-4">
      <header className="pt-4">
        <p className="text-sm text-slate-500 capitalize dark:text-slate-400">{fmtLongDate(data.today)}</p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Bonjour 👋</h1>
          <span className={cx('rounded-full px-3 py-1 text-sm font-semibold', STATUS_META[data.status].badge)}>
            {STATUS_META[data.status].label}
          </span>
        </div>
      </header>

      {/* Dépenses du mois */}
      <Card onClick={() => navigate('/depenses')}>
        <p className="text-sm text-slate-500 dark:text-slate-400">Dépenses {deMonth(data.month)}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{fmtDA(data.current)}</p>
        <p
          className={cx(
            'mt-1 flex items-center gap-1 text-sm font-medium',
            delta > 0 ? 'text-red-600 dark:text-red-400' : delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500',
          )}
        >
          {delta > 0 ? <ArrowUp className="size-4" /> : delta < 0 ? <ArrowDown className="size-4" /> : <Minus className="size-4" />}
          {delta === 0 ? 'Identique au mois précédent' : `${delta > 0 ? '+' : '−'}${fmtDA(Math.abs(delta))}`}
          {pct !== null && delta !== 0 && ` (${delta > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)} %)`}
          {delta !== 0 && <span className="font-normal text-slate-500 dark:text-slate-400">vs mois précédent</span>}
        </p>
      </Card>

      {/* Soldes */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['conge', 'Congé'],
            ['recup', 'Récup.'],
            ['rc', 'RC'],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            to="/soldes"
            className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{fmtDays(data.balances[k].remaining)}</p>
          </Link>
        ))}
      </div>

      {/* Prochaine échéance */}
      <Card>
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">Prochaine échéance</p>
            {next ? (
              <p className="font-semibold">
                {next.label} — {fmtDate(next.date)}
                {next.amount ? <span className="block font-normal text-slate-600 dark:text-slate-300">{fmtDA(next.amount)}</span> : null}
              </p>
            ) : (
              <p className="font-semibold">Aucune échéance</p>
            )}
          </div>
        </div>
      </Card>

      <RemindersList />

      {/* Modules */}
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Modules</h2>
        <div className="grid grid-cols-3 gap-2">
          {MODULES.map(({ path, label, icon: Icon, tint }) => (
            <Link
              key={path}
              to={path}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800"
            >
              <span className={cx('flex size-12 items-center justify-center rounded-2xl', tint)}>
                <Icon className="size-6" />
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
