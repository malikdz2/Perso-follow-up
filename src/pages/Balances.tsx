import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { db, type BalanceMove, type BalanceType } from '../db/db';
import { useSettings } from '../db/settings';
import { BALANCE_LABELS, computeBalances } from '../lib/balances';
import { MONTHS_FR, fmtDate, todayISO } from '../lib/dates';
import { confirmedHolidaySet, setDaysStatus } from '../lib/engine';
import { fmtDays, parseNum } from '../lib/format';
import { countDeducted, dateRange, futureAccruals, referencePeriod } from '../lib/rules';
import { cx } from '../lib/cx';
import { Button, Card, Field, Input, PageHeader, Segmented, Select, Sheet } from '../components/ui';

const TYPES: BalanceType[] = ['conge', 'recup', 'rc'];
const ORIGIN_LABEL = { auto: 'Auto', calendrier: 'Calendrier', manuel: 'Manuel' } as const;
const ORIGIN_CLS = {
  auto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  calendrier: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  manuel: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
} as const;

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtDays(Math.abs(n))}`;

// ───────────── Ajustement manuel ─────────────

interface AdjustForm {
  id?: number;
  type: BalanceType;
  sign: '+' | '-';
  days: string;
  date: string;
  reason: string;
}

function AdjustSheet({ initial, onClose }: { initial: AdjustForm; onClose: () => void }) {
  const [f, setF] = useState<AdjustForm>(initial);
  const [error, setError] = useState('');

  const save = async () => {
    const days = parseNum(f.days);
    if (!(days > 0)) return setError('Indiquez un nombre de jours positif (ex. : 1 ou 0,5).');
    if (!f.date) return setError('Indiquez la date.');
    if (!f.reason.trim()) return setError('Le motif est obligatoire.');
    const move = { type: f.type, date: f.date, days: f.sign === '+' ? days : -days, origin: 'manuel' as const, reason: f.reason.trim() };
    if (f.id) await db.balanceMoves.update(f.id, move);
    else await db.balanceMoves.add({ ...move, createdAt: Date.now() });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={f.id ? 'Modifier l’ajustement' : 'Ajustement manuel'}>
      <div className="space-y-3">
        <Field label="Compteur" group>
          <Segmented value={f.type} onChange={(type) => setF({ ...f, type })} options={TYPES.map((t) => ({ value: t, label: BALANCE_LABELS[t] }))} />
        </Field>
        <Field label="Sens" group>
          <Segmented
            value={f.sign}
            onChange={(sign) => setF({ ...f, sign })}
            options={[
              { value: '+', label: 'Ajouter (gagné)' },
              { value: '-', label: 'Retirer' },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jours">
            <Input inputMode="decimal" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
        <Field label="Motif">
          <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={f.type === 'rc' ? 'Ex. : permanence du 15/11' : 'Ex. : correction RH'} />
        </Field>
        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <Button block onClick={() => void save()}>
          Enregistrer
        </Button>
        {f.id && (
          <Button
            block
            variant="ghost"
            className="text-red-600 dark:text-red-400"
            onClick={async () => {
              await db.balanceMoves.delete(f.id!);
              onClose();
            }}
          >
            <Trash2 className="size-4" /> Supprimer
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ───────────── Planificateur ─────────────

function Planner({ remaining, initLeaveDate }: { remaining: Record<BalanceType, number>; initLeaveDate?: string }) {
  const settings = useSettings();
  const today = todayISO();
  const [type, setType] = useState<BalanceType>('conge');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [done, setDone] = useState('');
  const holidays = useLiveQuery(confirmedHolidaySet);
  const valid = !!start && !!end && start <= end;
  // Jours déjà posés avec ce statut : déjà déduits du solde actuel, à ne pas compter deux fois.
  const alreadySet = useLiveQuery(
    async () => new Set(valid ? (await db.days.where('date').between(start, end, true, true).toArray()).filter((d) => d.status === type).map((d) => d.date) : []),
    [start, end, type, valid],
  );

  if (!settings || !holidays || !alreadySet) return null;
  const dates = valid ? dateRange(start, end) : [];
  const deducted = valid ? countDeducted(dates.filter((d) => !alreadySet.has(d)), type, holidays, settings) : 0;
  const already = valid ? countDeducted(dates.filter((d) => alreadySet.has(d)), type, holidays, settings) : 0;
  const accruals = valid && type === 'conge' && initLeaveDate ? futureAccruals(today > initLeaveDate ? today : initLeaveDate, end) : 0;
  const after = remaining[type] + accruals - deducted;

  return (
    <Card className="space-y-3">
      <Segmented value={type} onChange={(t) => (setType(t), setDone(''))} options={TYPES.map((t) => ({ value: t, label: BALANCE_LABELS[t] }))} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Du">
          <Input type="date" value={start} onChange={(e) => (setStart(e.target.value), setDone(''), (!end || end < e.target.value) && setEnd(e.target.value))} />
        </Field>
        <Field label="Au">
          <Input type="date" value={end} min={start} onChange={(e) => (setEnd(e.target.value), setDone(''))} />
        </Field>
      </div>
      {start && end && start > end && <p className="text-sm text-red-600">La date de fin précède la date de début.</p>}
      {valid && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <div className="flex justify-between gap-3 py-0.5">
            <span>Solde actuel</span>
            <span className="shrink-0 font-medium whitespace-nowrap">{fmtDays(remaining[type])}</span>
          </div>
          {accruals > 0 && (
            <div className="flex justify-between gap-3 py-0.5">
              <span>Acquis d'ici le {fmtDate(end)}</span>
              <span className="shrink-0 font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">+{fmtDays(accruals)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 py-0.5">
            <span className="min-w-0">
              Jours décomptés
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                ({dates.length} j au total{type !== 'conge' || settings.leaveCountMode === 'ouvrables' ? ', hors week-ends et fériés' : ''})
              </span>
            </span>
            <span className={cx('shrink-0 font-medium whitespace-nowrap', deducted > 0 && 'text-red-600 dark:text-red-400')}>{deducted > 0 ? `−${fmtDays(deducted)}` : fmtDays(0)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-700">
            <span>Solde restant</span>
            <span className={after < 0 ? 'text-red-600 dark:text-red-400' : ''}>{fmtDays(after)}</span>
          </div>
          {after < 0 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Solde insuffisant.</p>}
          {already > 0 && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{fmtDays(already)} déjà posé{already > 1 ? 's' : ''} sur cette période (déjà déduit{already > 1 ? 's' : ''}).</p>}
        </div>
      )}
      {valid && deducted > 0 && (
        <Button
          block
          variant="secondary"
          onClick={async () => {
            const r = await setDaysStatus(dates, type);
            setDone(`${r.applied} jour${r.applied > 1 ? 's' : ''} posé${r.applied > 1 ? 's' : ''} dans le calendrier.`);
          }}
        >
          <CalendarPlus className="size-4" /> Poser ces jours dans le calendrier
        </Button>
      )}
      {done && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{done}</p>}
    </Card>
  );
}

// ───────────── Page ─────────────

export default function Balances() {
  const moves = useLiveQuery(() => db.balanceMoves.toArray());
  const [filter, setFilter] = useState<BalanceType | 'all'>('all');
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [query, setQuery] = useState('');
  const today = todayISO();
  const [params, setParams] = useSearchParams();
  // Ouverture directe depuis le bouton « + » : « RC gagné ».
  const [adjust, setAdjust] = useState<AdjustForm | null>(() => (params.get('ajout') === 'rc' ? { type: 'rc', sign: '+', days: '1', date: today, reason: '' } : null));
  useEffect(() => {
    if (params.has('ajout')) setParams({}, { replace: true });
  }, [params, setParams]);

  const years = useMemo(() => [...new Set([today.slice(0, 4), ...(moves ?? []).map((m) => m.date.slice(0, 4))])].sort().reverse(), [moves, today]);

  if (!moves) return null;
  const b = computeBalances(moves);
  const period = referencePeriod(today);
  const acquiredInPeriod = moves.filter((m) => m.type === 'conge' && m.origin === 'auto' && m.date >= period.start && m.date <= period.end).reduce((s, m) => s + m.days, 0);
  const upcoming = (t: BalanceType) => moves.filter((m) => m.type === t && m.days < 0 && m.date > today).reduce((s, m) => s - m.days, 0);
  const initLeave = moves.find((m) => m.autoKey === 'init-conge');

  const q = query.trim().toLowerCase();
  const history = moves
    .filter((m) => (filter === 'all' || m.type === filter) && (year === 'all' || m.date.startsWith(year)) && (month === 'all' || m.date.slice(5, 7) === month))
    .filter((m) => !q || m.reason.toLowerCase().includes(q) || fmtDate(m.date).includes(q))
    .sort((a, c) => c.date.localeCompare(a.date) || c.createdAt - a.createdAt);

  const openEdit = (m: BalanceMove) =>
    m.origin === 'manuel' && !m.autoKey?.startsWith('init-')
      ? setAdjust({ id: m.id, type: m.type, sign: m.days >= 0 ? '+' : '-', days: String(Math.abs(m.days)).replace('.', ','), date: m.date, reason: m.reason })
      : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Soldes" />

      <div className="space-y-2">
        {TYPES.map((t) => (
          <Card key={t} onClick={() => setFilter(filter === t ? 'all' : t)} className={cx(filter === t && 'ring-2 ring-emerald-500 dark:ring-emerald-500')}>
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">{BALANCE_LABELS[t]}</p>
              <p className="text-2xl font-bold tabular-nums">{fmtDays(b[t].remaining)}</p>
            </div>
            <div className="mt-1 flex gap-4 text-sm text-slate-500 dark:text-slate-400">
              <span>Acquis {fmtDays(b[t].acquired)}</span>
              <span>Pris {fmtDays(b[t].taken)}</span>
              {upcoming(t) > 0 && <span>dont à venir {fmtDays(upcoming(t))}</span>}
            </div>
            {t === 'conge' && (
              <div className="mt-2">
                <div className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Acquis sur la période {period.label}</span>
                  <span className="shrink-0 whitespace-nowrap">{fmtDays(acquiredInPeriod)} / 30 j</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (acquiredInPeriod / 30) * 100)}%` }} />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setAdjust({ type: 'rc', sign: '+', days: '1', date: today, reason: '' })}>
          <Plus className="size-4" /> RC gagné
        </Button>
        <Button variant="secondary" onClick={() => setAdjust({ type: filter === 'all' ? 'conge' : filter, sign: '+', days: '', date: today, reason: '' })}>
          <SlidersHorizontal className="size-4" /> Ajustement
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Planificateur</h2>
        <Planner remaining={{ conge: b.conge.remaining, recup: b.recup.remaining, rc: b.rc.remaining }} initLeaveDate={initLeave?.date} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Historique des mouvements</h2>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all' as const, label: 'Tous' }, ...TYPES.map((t) => ({ value: t, label: t === 'recup' ? 'Récup.' : BALANCE_LABELS[t] }))]}
        />
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
            {MONTHS_FR.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, '0')}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-3 left-3 size-5 text-slate-400" />
          <Input className="pl-10" placeholder="Rechercher un motif ou une date" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>

        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Aucun mouvement.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            {history.map((m) => {
              const editable = m.origin === 'manuel' && !m.autoKey?.startsWith('init-');
              return (
                <li key={m.id}>
                  <button type="button" disabled={!editable} onClick={() => openEdit(m)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left enabled:active:bg-slate-50 dark:enabled:active:bg-slate-800">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.reason}</p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {fmtDate(m.date)} · {BALANCE_LABELS[m.type]}
                        <span className={cx('rounded px-1.5 py-0.5 font-medium', ORIGIN_CLS[m.origin])}>{ORIGIN_LABEL[m.origin]}</span>
                      </p>
                    </div>
                    <span className={cx('font-bold tabular-nums', m.days > 0 ? 'text-emerald-700 dark:text-emerald-400' : m.days < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500')}>
                      {signed(m.days)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Les mouvements « Calendrier » se modifient depuis le calendrier ; les « Auto » sont calculés. Le solde de départ se change via Réglages → Relancer l'assistant.
        </p>
      </section>

      {adjust && <AdjustSheet initial={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}
