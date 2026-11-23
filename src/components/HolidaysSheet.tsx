import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, Trash2, Undo2 } from 'lucide-react';
import { db, type Holiday } from '../db/db';
import { addDays, fmtLongDate } from '../lib/dates';
import { ensureHolidays, syncCalendarMoves } from '../lib/engine';
import { cx } from '../lib/cx';
import { Button, Field, Input, Sheet } from './ui';

function IconBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cx('flex size-11 items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700', className)}>
      {children}
    </button>
  );
}

/** Liste des jours fériés d'une année : confirmer / décaler les fêtes religieuses, ajouter un jour. */
export function HolidaysSheet({ open, onClose, initialYear }: { open: boolean; onClose: () => void; initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open) void ensureHolidays(year);
  }, [open, year]);

  const list = useLiveQuery(() => db.holidays.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).sortBy('date'), [year]);

  const change = async (fn: () => Promise<unknown>) => {
    await fn();
    await syncCalendarMoves(); // un férié confirmé change les récupérations de mission
  };
  const update = (h: Holiday, patch: Partial<Holiday>) => change(() => db.holidays.update(h.id!, patch));
  const pending = list?.filter((h) => !h.confirmed).length ?? 0;

  return (
    <Sheet open={open} onClose={onClose} title="Jours fériés">
      <div className="mb-3 flex items-center">
        <IconBtn label="Année précédente" onClick={() => setYear(year - 1)}>
          <ChevronLeft className="size-5" />
        </IconBtn>
        <p className="flex-1 text-center text-lg font-bold">{year}</p>
        <IconBtn label="Année suivante" onClick={() => setYear(year + 1)}>
          <ChevronRight className="size-5" />
        </IconBtn>
      </div>
      {pending > 0 && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {pending} fête{pending > 1 ? 's' : ''} religieuse{pending > 1 ? 's' : ''} à confirmer. Dates estimées (calendrier lunaire) : décalez d'un jour si l'annonce officielle diffère, puis confirmez.
        </p>
      )}
      <ul className="space-y-2">
        {list?.map((h) => (
          <li key={h.id} className={cx('rounded-xl p-3 ring-1', h.confirmed ? 'ring-slate-200 dark:ring-slate-800' : 'bg-amber-50/60 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900')}>
            <p className="font-semibold">{h.name}</p>
            <p className="text-sm text-slate-600 capitalize dark:text-slate-300">
              {fmtLongDate(h.date)}
              <span className="normal-case"> · {h.confirmed ? 'confirmé' : 'proposé'}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!h.confirmed && (
                <>
                  <IconBtn label="Un jour plus tôt" onClick={() => void update(h, { date: addDays(h.date, -1) })}>
                    <Minus className="size-4" />
                  </IconBtn>
                  <IconBtn label="Un jour plus tard" onClick={() => void update(h, { date: addDays(h.date, 1) })}>
                    <Plus className="size-4" />
                  </IconBtn>
                  <Button className="flex-1" onClick={() => void update(h, { confirmed: true })}>
                    <Check className="size-4" /> Confirmer
                  </Button>
                </>
              )}
              {h.confirmed && h.kind === 'religieuse' && (
                <Button variant="secondary" className="flex-1 text-sm" onClick={() => void update(h, { confirmed: false })}>
                  <Undo2 className="size-4" /> Annuler la confirmation
                </Button>
              )}
              <IconBtn label="Supprimer" className="ml-auto text-red-600" onClick={() => void change(() => db.holidays.delete(h.id!))}>
                <Trash2 className="size-4" />
              </IconBtn>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newDate || !newName.trim()) return;
          void change(() => db.holidays.add({ date: newDate, name: newName.trim(), kind: 'civile', confirmed: true }));
          setNewDate('');
          setNewName('');
        }}
      >
        <p className="font-semibold">Ajouter un jour férié</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date">
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </Field>
          <Field label="Nom">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex. : 3e jour de l'Aïd" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" block disabled={!newDate || !newName.trim()}>
          <Plus className="size-4" /> Ajouter
        </Button>
      </form>
    </Sheet>
  );
}
