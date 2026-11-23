import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, ChevronLeft, ChevronRight, Settings2, Wallet } from 'lucide-react';
import { db, type Expense } from '../../db/db';
import { addMonths, fmtDate, fmtMonth, monthKey, todayISO } from '../../lib/dates';
import { fmtDA } from '../../lib/format';
import { expensesByCategory } from '../../lib/expenses';
import { cx } from '../../lib/cx';
import { expenseForm } from '../../components/forms';
import { RecordList, type ListConfig, type Row } from '../../components/RecordList';
import { Card } from '../../components/ui';

const LEVEL_BAR = { none: 'bg-slate-400', ok: 'bg-emerald-500', warn: 'bg-amber-500', over: 'bg-red-500' };

function BudgetCard() {
  const [month, setMonth] = useState(monthKey(todayISO()));
  const data = useLiveQuery(() => expensesByCategory(month), [month]);
  if (!data) return null;
  const alerts = data.rows.filter((r) => r.level === 'warn' || r.level === 'over');
  const shown = data.rows.filter((r) => r.spent > 0 || r.category.budget > 0);
  const totalBudget = data.rows.reduce((s, r) => s + r.category.budget, 0);
  const go = (n: number) => setMonth(monthKey(addMonths(`${month}-01`, n)));
  return (
    <Card className="space-y-3">
      <div className="flex items-center">
        <button type="button" aria-label="Mois précédent" onClick={() => go(-1)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800">
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm text-slate-500 capitalize dark:text-slate-400">{fmtMonth(month)}</p>
          <p className="text-2xl font-bold tabular-nums">{fmtDA(data.total)}</p>
          {totalBudget > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">sur {fmtDA(totalBudget)} de budget</p>}
        </div>
        <button type="button" aria-label="Mois suivant" onClick={() => go(1)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800">
          <ChevronRight className="size-5" />
        </button>
      </div>
      {alerts.map((r) => (
        <p
          key={r.category.id}
          role="alert"
          className={cx('rounded-xl px-3 py-2 text-sm font-medium', r.level === 'over' ? 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200')}
        >
          {r.level === 'over' ? '⛔' : '⚠️'} {r.category.name} : {Math.round(r.ratio * 100)} % du budget ({fmtDA(r.spent)} / {fmtDA(r.category.budget)})
        </p>
      ))}
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.category.id}>
            <div className="flex items-center gap-2 text-sm">
              <span className="size-3 shrink-0 rounded-full" style={{ background: r.category.color }} />
              <span className="flex-1 truncate">{r.category.name}</span>
              <span className="tabular-nums">
                <strong>{fmtDA(r.spent)}</strong>
                {r.category.budget > 0 && <span className="text-slate-500 dark:text-slate-400"> / {fmtDA(r.category.budget)}</span>}
              </span>
            </div>
            {r.category.budget > 0 && (
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className={cx('h-full rounded-full', LEVEL_BAR[r.level])} style={{ width: `${Math.min(100, r.ratio * 100)}%` }} />
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="text-center text-sm text-slate-500">Aucune dépense ce mois-ci.</li>}
      </ul>
      <Link to="/depenses/categories" className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-emerald-700 active:bg-emerald-50 dark:text-emerald-400 dark:active:bg-slate-800">
        <Settings2 className="size-4" /> Catégories et budgets
      </Link>
    </Card>
  );
}

export default function ExpensesPage() {
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray());
  const config = useMemo<ListConfig | null>(() => {
    if (!categories) return null;
    const byId = new Map(categories.map((c) => [c.id!, c]));
    return {
      ...expenseForm(categories),
      emptyIcon: <Wallet className="size-10" />,
      emptyText: 'Ajoutez une dépense ici ou avec le bouton « + » (ex. : « 1500 courses »).',
      primary: (r: Row) => {
        const e = r as unknown as Expense;
        const c = byId.get(e.categoryId);
        return (
          <span className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: c?.color ?? '#94a3b8' }} />
            {c?.name ?? 'Sans catégorie'}
            {e.receipt && <Camera className="size-3.5 text-slate-400" aria-label="ticket photographié" />}
          </span>
        );
      },
      secondary: (r: Row) => [fmtDate(String(r.date)), r.note as string, r.missionId !== undefined && 'mission'].filter(Boolean).join(' · '),
      amount: (r: Row) => Number(r.amount),
      search: (r: Row) => `${byId.get(r.categoryId as number)?.name ?? ''} ${r.note ?? ''}`,
      header: <BudgetCard />,
    };
  }, [categories]);
  if (!config) return null;
  return <RecordList config={config} />;
}
