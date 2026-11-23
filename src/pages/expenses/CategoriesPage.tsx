import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { db, type Category } from '../../db/db';
import { fmtDA, parseDA } from '../../lib/format';
import { cx } from '../../lib/cx';
import { Button, Field, Input, PageHeader, Select, Sheet } from '../../components/ui';

const COLORS = ['#16a34a', '#2563eb', '#dc2626', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#64748b', '#ca8a04', '#0d9488', '#4f46e5', '#be123c'];

function CategorySheet({ initial, all, onClose }: { initial: Partial<Category>; all: Category[]; onClose: () => void }) {
  const [name, setName] = useState(initial.name ?? '');
  const [color, setColor] = useState(initial.color ?? COLORS[all.length % COLORS.length]);
  const [budget, setBudget] = useState(initial.budget ? String(initial.budget) : '');
  const [replacement, setReplacement] = useState('');
  const [error, setError] = useState('');
  const used = useLiveQuery(() => (initial.id !== undefined ? db.expenses.where('categoryId').equals(initial.id).count() : 0), [initial.id]);

  const save = async () => {
    if (!name.trim()) return setError('Indiquez le nom.');
    if (all.some((c) => c.id !== initial.id && c.name.toLowerCase() === name.trim().toLowerCase())) return setError('Cette catégorie existe déjà.');
    const data = { name: name.trim(), color, budget: parseDA(budget) };
    if (initial.id !== undefined) await db.categories.update(initial.id, data);
    else await db.categories.add({ ...data, order: Math.max(0, ...all.map((c) => c.order)) + 1 });
    onClose();
  };
  const remove = async () => {
    if (used && !replacement) return setError('Choisissez la catégorie qui recevra les dépenses existantes.');
    await db.transaction('rw', db.categories, db.expenses, db.keywords, async () => {
      if (used) await db.expenses.where('categoryId').equals(initial.id!).modify({ categoryId: Number(replacement) });
      // Les mots-clés de la saisie rapide suivent la catégorie de remplacement.
      const kws = db.keywords.filter((k) => k.target === `expense:${initial.id}`);
      if (replacement) await kws.modify({ target: `expense:${replacement}` });
      else await kws.delete();
      await db.categories.delete(initial.id!);
    });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id !== undefined ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
      <div className="space-y-3">
        <Field label="Nom">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Budget mensuel (DA)" hint="0 ou vide = pas de budget. Alerte à 80 % et à 100 %.">
          <Input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Field label="Couleur" group>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Couleur ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('size-10 rounded-full ring-offset-2 dark:ring-offset-slate-900', color === c && 'ring-2 ring-slate-900 dark:ring-white')}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <Button block onClick={() => void save()}>
          Enregistrer
        </Button>
        {initial.id !== undefined && all.length > 1 && (
          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            {!!used && (
              <Field label={`${used} dépense${used > 1 ? 's' : ''} à transférer vers`}>
                <Select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                  <option value="">Choisir…</option>
                  {all
                    .filter((c) => c.id !== initial.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Button block variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => void remove()}>
              <Trash2 className="size-4" /> Supprimer la catégorie
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export default function CategoriesPage() {
  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray());
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  if (!cats) return null;
  const move = async (i: number, dir: -1 | 1) => {
    const a = cats[i];
    const b = cats[i + dir];
    if (!a || !b) return;
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(a.id!, { order: b.order });
      await db.categories.update(b.id!, { order: a.order });
    });
  };
  const total = cats.reduce((s, c) => s + c.budget, 0);
  return (
    <div className="space-y-3">
      <PageHeader
        title="Catégories et budgets"
        action={
          <Button className="mr-1 px-3" onClick={() => setEdit({})}>
            <Plus className="size-5" /> Ajouter
          </Button>
        }
      />
      <p className="text-sm text-slate-500 dark:text-slate-400">Budget mensuel total : {fmtDA(total)}</p>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        {cats.map((c, i) => (
          <li key={c.id} className="flex items-center">
            <button type="button" onClick={() => setEdit(c)} className="flex min-h-14 flex-1 items-center gap-3 px-4 text-left active:bg-slate-50 dark:active:bg-slate-800">
              <span className="size-4 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">{c.budget ? fmtDA(c.budget) : 'sans budget'}</span>
            </button>
            <div className="flex pr-1">
              <button type="button" aria-label={`Monter ${c.name}`} disabled={i === 0} onClick={() => void move(i, -1)} className="flex size-11 items-center justify-center rounded-full disabled:opacity-30">
                <ArrowUp className="size-4" />
              </button>
              <button type="button" aria-label={`Descendre ${c.name}`} disabled={i === cats.length - 1} onClick={() => void move(i, 1)} className="flex size-11 items-center justify-center rounded-full disabled:opacity-30">
                <ArrowDown className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {edit && <CategorySheet initial={edit} all={cats} onClose={() => setEdit(null)} />}
    </div>
  );
}
