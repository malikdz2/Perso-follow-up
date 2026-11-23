import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, Flag, ListChecks, RotateCcw } from 'lucide-react';
import { db, type DayStatus } from '../db/db';
import { useSettings } from '../db/settings';
import { computeBalances } from '../lib/balances';
import { addMonths, daysInMonth, fmtDate, fmtLongDate, fmtMonth, monthKey, parseISO, pad, todayISO, type ISODate } from '../lib/dates';
import { ensureHolidays, setDaysStatus } from '../lib/engine';
import { fmtDays } from '../lib/format';
import { autoStatus, countDeducted } from '../lib/rules';
import { STATUS_META, STATUS_ORDER } from '../lib/status';
import { cx } from '../lib/cx';
import { Button, PageHeader, Sheet } from '../components/ui';
import { HolidaysSheet } from '../components/HolidaysSheet';

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function useMonthData(month: string) {
  return useLiveQuery(async () => {
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = `${month}-${pad(daysInMonth(y, m - 1))}`;
    const [days, holidays, moves] = await Promise.all([
      db.days.where('date').between(start, end, true, true).toArray(),
      db.holidays.where('date').between(`${y}-01-01`, `${y}-12-31`, true, true).toArray(),
      db.balanceMoves.toArray(),
    ]);
    const confirmed = new Set(holidays.filter((h) => h.confirmed).map((h) => h.date));
    return {
      entries: new Map(days.map((d) => [d.date, d])),
      holidayByDate: new Map(holidays.map((h) => [h.date, h])),
      confirmed,
      balances: computeBalances(moves),
    };
  }, [month]);
}

export default function Calendar() {
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<ISODate[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [toast, setToast] = useState('');
  const data = useMonthData(month);
  const settings = useSettings();
  const longPress = useRef<{ timer?: number; fired: boolean }>({ fired: false });
  const touchX = useRef<number | null>(null);

  const year = Number(month.slice(0, 4));
  useEffect(() => {
    void ensureHolidays(year);
  }, [year]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!data || !settings) return null;

  const [y, m] = month.split('-').map(Number);
  const nbDays = daysInMonth(y, m - 1);
  const firstWeekday = parseISO(`${month}-01`).getDay(); // 0 = dimanche (début de semaine en Algérie)
  const dates = Array.from({ length: nbDays }, (_, i) => `${month}-${pad(i + 1)}`);
  const statusOf = (d: ISODate): DayStatus => data.entries.get(d)?.status ?? autoStatus(d, data.confirmed);

  const counts = new Map<DayStatus, number>();
  for (const d of dates) counts.set(statusOf(d), (counts.get(statusOf(d)) ?? 0) + 1);

  const go = (n: number) => setMonth(monthKey(addMonths(`${month}-01`, n)));

  const onDayClick = (d: ISODate) => {
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    if (multi) setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));
    else {
      setSelected([d]);
      setSheetOpen(true);
    }
  };
  const startLongPress = (d: ISODate) => {
    longPress.current.fired = false;
    window.clearTimeout(longPress.current.timer);
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true;
      setToast('');
      setMulti(true);
      setSelected((s) => (s.includes(d) ? s : [...s, d]));
      navigator.vibrate?.(20);
    }, 450);
  };
  const cancelLongPress = () => window.clearTimeout(longPress.current.timer);

  const exitMulti = () => {
    setMulti(false);
    setSelected([]);
  };

  const apply = async (status: DayStatus | null) => {
    const sorted = [...selected].sort();
    const r = await setDaysStatus(sorted, status);
    setSheetOpen(false);
    exitMulti();
    const what = status ? STATUS_META[status].label.toLowerCase() : 'statut automatique';
    let msg = `${r.applied} jour${r.applied > 1 ? 's' : ''} → ${what}`;
    if (r.skipped) msg += ` · ${r.skipped} ignoré${r.skipped > 1 ? 's' : ''} (week-end, férié ou mission)`;
    setToast(msg);
  };

  const single = selected.length === 1 ? selected[0] : null;
  const holidayOfSingle = single ? data.holidayByDate.get(single) : undefined;

  return (
    <div>
      <PageHeader
        title="Calendrier"
        back={false}
        action={
          <button
            type="button"
            onClick={() => setHolidaysOpen(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-emerald-700 active:bg-emerald-50 dark:text-emerald-400 dark:active:bg-slate-800"
          >
            <Flag className="size-4" /> Fériés
          </button>
        }
      />

      {/* Navigation mois */}
      <div className="mb-3 flex items-center gap-1">
        <button type="button" aria-label="Mois précédent" onClick={() => go(-1)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800">
          <ChevronLeft className="size-6" />
        </button>
        <h2 className="flex-1 text-center text-lg font-bold capitalize">{fmtMonth(month)}</h2>
        <button type="button" aria-label="Mois suivant" onClick={() => go(1)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800">
          <ChevronRight className="size-6" />
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        <Button variant="secondary" className="flex-1 text-sm" onClick={() => setMonth(monthKey(today))} disabled={month === monthKey(today)}>
          <CalendarCheck className="size-4" /> Aujourd'hui
        </Button>
        <Button variant={multi ? 'primary' : 'secondary'} className="flex-1 text-sm" onClick={() => (multi ? exitMulti() : (setToast(''), setMulti(true)))} aria-pressed={multi}>
          <ListChecks className="size-4" /> {multi ? 'Sélection…' : 'Plusieurs jours'}
        </Button>
      </div>

      {/* Grille */}
      <div
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cx(i >= 5 && 'text-emerald-700 dark:text-emerald-400')}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={fmtMonth(month)}>
          {Array.from({ length: firstWeekday }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {dates.map((d) => {
            const st = statusOf(d);
            const h = data.holidayByDate.get(d);
            const isSel = selected.includes(d) && (multi || sheetOpen);
            return (
              <button
                key={d}
                type="button"
                aria-label={`${fmtLongDate(d)} : ${STATUS_META[st].label}${h ? ` (${h.name}${h.confirmed ? '' : ', à confirmer'})` : ''}`}
                aria-pressed={multi ? isSel : undefined}
                onClick={() => onDayClick(d)}
                onPointerDown={() => startLongPress(d)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(e) => e.preventDefault()}
                className={cx(
                  'relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl text-base font-semibold tabular-nums select-none',
                  STATUS_META[st].cell,
                  d === today && 'outline-2 outline-offset-1 outline-emerald-600 dark:outline-emerald-400',
                  isSel && 'scale-90 ring-4 ring-emerald-400/80',
                )}
              >
                {Number(d.slice(8))}
                {h && !h.confirmed && <span className="absolute bottom-1 size-1.5 rounded-full bg-red-500 ring-1 ring-white" title="Férié à confirmer" />}
                {data.entries.get(d)?.note && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-current opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        Touchez un jour pour changer son statut · appui long ou « Plusieurs jours » pour en sélectionner plusieurs · glissez pour changer de mois
      </p>

      {/* Légende + compteurs du mois */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-2 text-sm">
            <span className={cx('size-4 shrink-0 rounded-md', STATUS_META[s].swatch)} />
            <span className="flex-1">{STATUS_META[s].label}</span>
            <span className="font-semibold tabular-nums">{counts.get(s) ?? 0}</span>
          </div>
        ))}
        <div className="col-span-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="size-2 rounded-full bg-red-500" /> Férié religieux proposé, à confirmer (bouton « Fériés »)
        </div>
      </div>

      {/* Soldes actuels */}
      <div className="mt-3 flex justify-around rounded-2xl bg-white p-3 text-center text-sm shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
        <span>Congé <strong className="block text-base">{fmtDays(data.balances.conge.remaining)}</strong></span>
        <span>Récup. <strong className="block text-base">{fmtDays(data.balances.recup.remaining)}</strong></span>
        <span>RC <strong className="block text-base">{fmtDays(data.balances.rc.remaining)}</strong></span>
      </div>

      {/* Barre d'action en mode sélection multiple */}
      {multi && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto flex max-w-md gap-2 px-4">
          <Button variant="secondary" className="flex-1 shadow-lg" onClick={exitMulti}>
            Annuler
          </Button>
          <Button className="flex-[2] shadow-lg" disabled={selected.length === 0} onClick={() => setSheetOpen(true)}>
            {selected.length} jour{selected.length > 1 ? 's' : ''} → statut
          </Button>
        </div>
      )}

      {toast && !multi && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-40 mx-auto max-w-md px-4">
          <p className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">{toast}</p>
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          if (!multi) setSelected([]);
        }}
        title={single ? fmtLongDate(single) : `${selected.length} jours sélectionnés`}
      >
        {holidayOfSingle && (
          <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            🎉 {holidayOfSingle.name}
            {!holidayOfSingle.confirmed && ' — proposé, à confirmer dans « Fériés »'}
          </p>
        )}
        {single && data.entries.get(single)?.missionId !== undefined && (
          <Link
            to={`/missions/${data.entries.get(single)!.missionId}`}
            className="mb-3 flex min-h-11 items-center justify-between rounded-xl bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
          >
            <span>Jour de mission — se modifie depuis la fiche de la mission.</span>
            <ChevronRight className="size-4 shrink-0" />
          </Link>
        )}
        {!single && selected.length > 0 && (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Du {fmtDate([...selected].sort()[0])} au {fmtDate([...selected].sort().at(-1))}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((s) => {
            const deducted = s === 'conge' || s === 'recup' || s === 'rc' ? countDeducted(selected.filter((d) => statusOf(d) !== s), s, data.confirmed, settings) : 0;
            const current = single ? statusOf(single) === s : false;
            return (
              <button
                key={s}
                type="button"
                onClick={() => void apply(s)}
                className={cx(
                  'flex min-h-14 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold ring-1',
                  current ? 'bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950/40' : 'bg-slate-50 ring-slate-200 active:bg-slate-100 dark:bg-slate-800 dark:ring-slate-700',
                )}
              >
                <span className={cx('size-5 shrink-0 rounded-md', STATUS_META[s].swatch)} />
                <span className="flex-1">
                  {STATUS_META[s].label}
                  {deducted > 0 && (
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      −{fmtDays(deducted)} → reste {fmtDays(data.balances[s as 'conge' | 'recup' | 'rc'].remaining - deducted)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <Button variant="ghost" block className="mt-3" onClick={() => void apply(null)}>
          <RotateCcw className="size-4" /> Statut automatique
        </Button>
      </Sheet>

      {holidaysOpen && <HolidaysSheet open onClose={() => setHolidaysOpen(false)} initialYear={year} />}
    </div>
  );
}
