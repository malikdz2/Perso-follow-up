// Liste générique : ajouter, modifier, supprimer, rechercher, filtrer par mois et par année.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Table } from 'dexie';
import { Camera, Plus, Search, Trash2 } from 'lucide-react';
import { compressImage } from '../lib/images';
import { fromForm, toForm } from './recordForm';
import { db } from '../db/db';
import { wilayaLabel } from '../data/wilayas';
import { MONTHS_FR, fmtDate, todayISO } from '../lib/dates';
import { fmtDA } from '../lib/format';
import { missionAt } from '../lib/missions';
import { cx } from '../lib/cx';
import { Button, EmptyState, Field, Input, PageHeader, Segmented, Select, Sheet } from './ui';

export type FieldType = 'date' | 'month' | 'text' | 'da' | 'decimal' | 'int' | 'select' | 'bool' | 'mission' | 'photo';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Suggestions (saisie libre) */
  suggestions?: string[];
  placeholder?: string;
  hint?: string;
  /** Occupe une demi-largeur */
  half?: boolean;
  /** Liste déroulante dont la valeur est un nombre (ex. : id de catégorie) */
  numeric?: boolean;
}

export type Row = { id?: number; [k: string]: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RowTable = Table<any, any, any>;
export type FormState = Record<string, string | boolean | Blob | undefined>;

/** Ce qu'il faut pour afficher le formulaire d'un module (réutilisé par la saisie rapide « + »). */
export interface FormConfig {
  title: string;
  addLabel: string;
  table: RowTable;
  /** Champ date utilisé pour le tri et les filtres */
  dateKey: string;
  fields: FieldDef[];
  defaults: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  onFieldChange?: (form: FormState, key: string) => FormState;
  validate?: (r: Row) => string | null;
}

export interface ListConfig extends FormConfig {
  primary: (r: Row, all: Row[]) => ReactNode;
  secondary: (r: Row, all: Row[]) => ReactNode;
  amount: (r: Row) => number;
  search: (r: Row) => string;
  summary?: (rows: Row[], all: Row[]) => ReactNode;
  emptyIcon: ReactNode;
  emptyText: string;
  /** Contenu affiché au-dessus des filtres */
  header?: ReactNode;
}

/** Photo (ticket de caisse…) : appareil photo ou galerie, réduite avant stockage. */
function PhotoField({ label, value, onChange }: { label: string; value?: Blob; onChange: (b?: Blob) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [full, setFull] = useState(false);
  const url = useMemo(() => (value ? URL.createObjectURL(value) : undefined), [value]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await compressImage(f));
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setFull(true)} aria-label="Agrandir la photo" className="size-16 overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
            <img src={url} alt={label} className="size-full object-cover" />
          </button>
          <Button variant="secondary" className="text-sm" onClick={() => ref.current?.click()}>
            Changer
          </Button>
          <Button variant="ghost" className="text-sm text-red-600 dark:text-red-400" onClick={() => onChange(undefined)}>
            Retirer
          </Button>
        </div>
      ) : (
        <Button variant="secondary" block onClick={() => ref.current?.click()}>
          <Camera className="size-4" /> Photographier le ticket
        </Button>
      )}
      {full && url && (
        <button type="button" aria-label="Fermer la photo" className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-2" onClick={() => setFull(false)}>
          <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}

export function RecordSheet({
  config,
  initial,
  onClose,
  banner,
  onSaved,
}: {
  config: FormConfig;
  initial: { id?: number; form: FormState };
  onClose: () => void;
  banner?: ReactNode;
  onSaved?: (row: Row) => void;
}) {
  const [form, setForm] = useState(initial.form);
  const [error, setError] = useState('');
  const [missionTouched, setMissionTouched] = useState(initial.id !== undefined);
  const missions = useLiveQuery(() => db.missions.orderBy('start').reverse().toArray());
  const hasMission = config.fields.some((f) => f.type === 'mission');
  const date = String(form[config.dateKey] ?? '');

  // Rattache automatiquement à la mission en cours à cette date.
  useEffect(() => {
    if (!hasMission || missionTouched || !date) return;
    let alive = true;
    void missionAt(date).then((m) => {
      if (!alive) return;
      const key = config.fields.find((f) => f.type === 'mission')!.key;
      setForm((cur) => ({ ...cur, [key]: m?.id !== undefined ? String(m.id) : '' }));
    });
    return () => {
      alive = false;
    };
  }, [date, hasMission, missionTouched, config.fields]);

  // Mise à jour fonctionnelle : ne perd jamais une valeur posée entre-temps (mission rattachée, photo réduite…).
  const set = (key: string, value: string | boolean | Blob | undefined) =>
    setForm((cur) => {
      const next = { ...cur, [key]: value };
      return config.onFieldChange ? config.onFieldChange(next, key) : next;
    });

  const save = async () => {
    for (const d of config.fields) {
      if (d.required && (form[d.key] === '' || form[d.key] === undefined)) return setError(`Champ obligatoire : ${d.label}`);
    }
    const row = fromForm(config.fields, form);
    const err = config.validate?.(row);
    if (err) return setError(err);
    if (initial.id !== undefined) {
      // Les champs vidés doivent être retirés de l'enregistrement.
      const existing = (await config.table.get(initial.id)) as Row;
      const merged: Row = { ...existing, ...row, id: initial.id };
      for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
      await config.table.put(merged);
      onSaved?.(merged);
    } else {
      const id = (await config.table.add(row)) as number;
      onSaved?.({ ...row, id });
    }
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id !== undefined ? 'Modifier' : config.addLabel}>
      {banner && <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">{banner}</div>}
      <div className="grid grid-cols-2 gap-3">
        {config.fields.map((d) => {
          const span = d.half ? '' : 'col-span-2';
          if (d.type === 'bool') {
            return (
              <div key={d.key} className={span}>
                <Field label={d.label} group>
                  <Segmented
                    value={form[d.key] ? 'oui' : 'non'}
                    onChange={(v) => set(d.key, v === 'oui')}
                    options={[
                      { value: 'oui', label: 'Oui' },
                      { value: 'non', label: 'Non' },
                    ]}
                  />
                </Field>
              </div>
            );
          }
          if (d.type === 'photo') {
            return (
              <div key={d.key} className={span}>
                <PhotoField label={d.label} value={form[d.key] as Blob | undefined} onChange={(b) => set(d.key, b)} />
              </div>
            );
          }
          if (d.type === 'select' || d.type === 'mission') {
            const options =
              d.type === 'mission'
                ? (missions ?? []).map((m) => ({ value: String(m.id), label: `${wilayaLabel(m.wilaya)} (${fmtDate(m.start)} → ${fmtDate(m.end)})` }))
                : (d.options ?? []);
            return (
              <div key={d.key} className={span}>
                <Field label={d.label} hint={d.hint}>
                  <Select
                    value={String(form[d.key] ?? '')}
                    onChange={(e) => {
                      if (d.type === 'mission') setMissionTouched(true);
                      set(d.key, e.target.value);
                    }}
                  >
                    {(d.type === 'mission' || !d.required) && <option value="">{d.type === 'mission' ? 'Aucune' : '—'}</option>}
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            );
          }
          const listId = d.suggestions ? `sugg-${d.key}` : undefined;
          return (
            <div key={d.key} className={span}>
              <Field label={d.label + (d.type === 'da' ? ' (DA)' : '')} hint={d.hint}>
                <Input
                  type={d.type === 'date' ? 'date' : d.type === 'month' ? 'month' : 'text'}
                  inputMode={d.type === 'da' || d.type === 'int' ? 'numeric' : d.type === 'decimal' ? 'decimal' : undefined}
                  placeholder={d.placeholder}
                  list={listId}
                  value={String(form[d.key] ?? '')}
                  onChange={(e) => set(d.key, e.target.value)}
                />
                {d.suggestions && (
                  <datalist id={listId}>
                    {d.suggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                )}
              </Field>
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <Button block className="mt-4" onClick={() => void save()}>
        Enregistrer
      </Button>
      {initial.id !== undefined && (
        <Button
          block
          variant="ghost"
          className="mt-1 text-red-600 dark:text-red-400"
          onClick={async () => {
            if (!window.confirm('Supprimer cet élément ?')) return;
            await config.table.delete(initial.id!);
            onClose();
          }}
        >
          <Trash2 className="size-4" /> Supprimer
        </Button>
      )}
    </Sheet>
  );
}

export function RecordList({ config }: { config: ListConfig }) {
  const all = useLiveQuery(() => config.table.toArray() as Promise<Row[]>, [config.table]);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [editing, setEditing] = useState<{ id?: number; form: FormState } | null>(null);

  if (!all) return null;
  const dateOf = (r: Row) => String(r[config.dateKey] ?? '');
  const years = [...new Set([todayISO().slice(0, 4), ...all.map((r) => dateOf(r).slice(0, 4))])].filter(Boolean).sort().reverse();
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((r) => (year === 'all' || dateOf(r).startsWith(year)) && (month === 'all' || dateOf(r).slice(5, 7) === month))
    .filter((r) => !q || config.search(r).toLowerCase().includes(q) || fmtDate(dateOf(r)).includes(q))
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || (b.id ?? 0) - (a.id ?? 0));
  const total = rows.reduce((s, r) => s + config.amount(r), 0);

  const openNew = async () => setEditing({ form: toForm(config.fields, await config.defaults()) });

  return (
    <div className="space-y-3">
      <PageHeader
        title={config.title}
        action={
          <Button className="mr-1 px-3" onClick={() => void openNew()}>
            <Plus className="size-5" /> Ajouter
          </Button>
        }
      />
      {config.header}
      {all.length === 0 ? (
        <EmptyState icon={config.emptyIcon} title="Rien pour l'instant">
          {config.emptyText}
        </EmptyState>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3 size-5 text-slate-400" />
            <Input className="pl-10" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Année" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="all">Toutes années</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <Select aria-label="Mois" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">Tous les mois</option>
              {MONTHS_FR.map((n, i) => (
                <option key={n} value={String(i + 1).padStart(2, '0')}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          {config.summary ? (
            config.summary(rows, all)
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {rows.length} élément{rows.length > 1 ? 's' : ''} · <strong className="text-slate-900 dark:text-slate-100">{fmtDA(total)}</strong>
            </p>
          )}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucun résultat.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setEditing({ id: r.id, form: toForm(config.fields, r) })}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{config.primary(r, all)}</div>
                      <div className={cx('truncate text-xs text-slate-500 dark:text-slate-400')}>{config.secondary(r, all)}</div>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{fmtDA(config.amount(r))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && <RecordSheet config={config} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
