import { NavLink } from 'react-router-dom';
import { CalendarDays, ChartColumn, House, Plus, Settings, type LucideIcon } from 'lucide-react';
import { cx } from '../lib/cx';

function Item({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cx(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium',
          isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400',
        )
      }
    >
      <Icon className="size-6" />
      {label}
    </NavLink>
  );
}

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto flex max-w-md items-stretch px-1">
        <Item to="/" label="Accueil" icon={House} />
        <Item to="/calendrier" label="Calendrier" icon={CalendarDays} />
        <div className="flex flex-1 items-start justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label="Nouvelle saisie"
            className="-mt-6 flex size-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-4 ring-slate-50 active:bg-emerald-700 dark:ring-slate-950"
          >
            <Plus className="size-8" strokeWidth={2.5} />
          </button>
        </div>
        <Item to="/recap" label="Récap" icon={ChartColumn} />
        <Item to="/reglages" label="Réglages" icon={Settings} />
      </div>
    </nav>
  );
}
