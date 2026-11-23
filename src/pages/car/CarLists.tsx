import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Droplets, Fuel, Package, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { db, type CarCheck, type CarMisc, type FuelEntry, type Insurance, type Maintenance } from '../../db/db';
import { useSettings } from '../../db/settings';
import { addDays, addMonths, fmtDate, todayISO } from '../../lib/dates';
import { fmtDA, fmtNum } from '../../lib/format';
import {
  CHECK_ALERT_DAYS,
  CHECK_LABELS,
  INSURANCE_ALERT_DAYS,
  MISC_LABELS,
  checkExpiry,
  currentKm,
  fuelStats,
  insuranceExpiry,
  nextOilChange,
  type Expiry,
} from '../../lib/car';
import { cx } from '../../lib/cx';
import { RecordList, type FormState, type ListConfig, type Row } from '../../components/RecordList';
import { FUEL_FORM, MAINTENANCE_FORM, MISC_FORM } from '../../components/forms';
import { Card } from '../../components/ui';

const today = () => todayISO();
const join = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' · ');

export function ExpiryBadge({ e, label }: { e: Expiry | null; label: string }) {
  if (!e) return <span className="text-sm text-slate-500">{label} : non renseigné</span>;
  const cls = { ok: 'text-emerald-700 dark:text-emerald-400', soon: 'text-amber-600 dark:text-amber-400', expired: 'text-red-600 dark:text-red-400' }[e.level];
  const txt = e.level === 'expired' ? `expiré depuis ${-e.daysLeft} j` : e.daysLeft === 0 ? "expire aujourd'hui" : `dans ${e.daysLeft} j`;
  return (
    <span className="text-sm">
      {label} : jusqu'au {fmtDate(e.date)} · <strong className={cls}>{txt}</strong>
    </span>
  );
}

// ───────────── Carburant ─────────────

export function FuelPage() {
  const all = useLiveQuery(() => db.fuel.toArray());
  const stats = useMemo(() => fuelStats(all ?? []), [all]);
  const config = useMemo<ListConfig>(
    () => ({
      ...FUEL_FORM,
      emptyIcon: <Fuel className="size-10" />,
      emptyText: 'Ajoutez vos pleins : la consommation se calcule entre deux pleins complets.',
      primary: (r: Row) => {
        const f = r as unknown as FuelEntry;
        const c = stats.perEntry.get(f.id!);
        return (
          <span>
            {fmtNum(f.liters)} L{f.full ? '' : ' (partiel)'}
            {c !== undefined && <span className="ml-2 rounded bg-sky-100 px-1.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">{fmtNum(c)} L/100</span>}
          </span>
        );
      },
      secondary: (r: Row) => {
        const f = r as unknown as FuelEntry;
        return join(fmtDate(f.date), `${fmtNum(f.km)} km`, `${fmtNum(f.pricePerLiter)} DA/L`, f.station, f.missionId !== undefined && 'mission');
      },
      amount: (r: Row) => (r as unknown as FuelEntry).amount,
      search: (r: Row) => join((r as unknown as FuelEntry).station),
      summary: (rows: Row[]) => {
        const s = fuelStats(rows as unknown as FuelEntry[]);
        return (
          <Card className="grid grid-cols-2 gap-y-2 text-sm">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Total</p>
              <p className="text-lg font-bold">{fmtDA(s.amount)}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Litres</p>
              <p className="text-lg font-bold">{fmtNum(s.liters)} L</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Conso. moyenne</p>
              <p className="text-lg font-bold">{stats.average !== null ? `${fmtNum(stats.average)} L/100` : '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Coût carburant</p>
              <p className="text-lg font-bold">{stats.costPerKm !== null ? `${fmtNum(stats.costPerKm)} DA/km` : '—'}</p>
            </div>
            <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Total et litres : période filtrée. Consommation et coût/km : depuis le premier plein.</p>
          </Card>
        );
      },
    }),
    [stats],
  );
  return <RecordList config={config} />;
}

// ───────────── Entretien ─────────────

export function MaintenancePage() {
  const settings = useSettings();
  const data = useLiveQuery(async () => ({ vehicle: await db.vehicle.toCollection().first(), fuel: await db.fuel.toArray(), maintenance: await db.maintenance.toArray() }));
  const interval = settings?.oilInterval ?? 10_000;
  const oil = data ? nextOilChange(data.maintenance, interval, currentKm(data.vehicle, data.fuel, data.maintenance)) : null;
  const config = useMemo<ListConfig>(
    () => ({
      ...MAINTENANCE_FORM,
      emptyIcon: <Wrench className="size-10" />,
      emptyText: 'Vidange, filtres, pneus, plaquettes, batterie…',
      primary: (r: Row) => {
        const m = r as unknown as Maintenance;
        return m.type.charAt(0).toUpperCase() + m.type.slice(1);
      },
      secondary: (r: Row) => {
        const m = r as unknown as Maintenance;
        return join(fmtDate(m.date), m.km ? `${fmtNum(m.km)} km` : '', m.garage, m.note);
      },
      amount: (r: Row) => (r as unknown as Maintenance).price,
      search: (r: Row) => {
        const m = r as unknown as Maintenance;
        return join(m.type, m.garage, m.note);
      },
    }),
    [],
  );
  const header = (
    <Card className="flex items-start gap-3">
      <Droplets className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div className="text-sm">
        {oil ? (
          <>
            <p className="font-semibold">Prochaine vidange à {fmtNum(oil.nextKm)} km</p>
            <p className={cx(oil.remaining !== null && oil.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300')}>
              {oil.remaining === null ? '' : oil.remaining < 0 ? `Dépassée de ${fmtNum(-oil.remaining)} km` : `Encore ${fmtNum(oil.remaining)} km`}
              {' '}(dernière : {fmtNum(oil.lastKm)} km le {fmtDate(oil.lastDate)}, intervalle {fmtNum(interval)} km)
            </p>
          </>
        ) : (
          <p>Enregistrez une vidange avec son kilométrage pour calculer la prochaine (intervalle : {fmtNum(interval)} km).</p>
        )}
        <Link to="/reglages" className="text-xs font-medium text-emerald-700 underline dark:text-emerald-400">
          Changer l'intervalle
        </Link>
      </div>
    </Card>
  );
  return <RecordList config={{ ...config, header }} />;
}

// ───────────── Accessoires ─────────────

export function AccessoriesPage() {
  const config = useMemo<ListConfig>(
    () => ({
      title: 'Accessoires',
      addLabel: 'Nouvel accessoire',
      table: db.accessories,
      dateKey: 'date',
      emptyIcon: <Package className="size-10" />,
      emptyText: 'Tapis, housses, chargeur, dashcam…',
      fields: [
        { key: 'item', label: 'Article', type: 'text', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true, half: true },
        { key: 'price', label: 'Prix', type: 'da', required: true, half: true },
      ],
      defaults: () => ({ date: today() }),
      primary: (r: Row) => String(r.item),
      secondary: (r: Row) => fmtDate(String(r.date)),
      amount: (r: Row) => Number(r.price),
      search: (r: Row) => String(r.item),
    }),
    [],
  );
  return <RecordList config={config} />;
}

// ───────────── Divers ─────────────

export function MiscPage() {
  const config = useMemo<ListConfig>(
    () => ({
      ...MISC_FORM,
      emptyIcon: <Sparkles className="size-10" />,
      emptyText: 'Lavage, parking, amende, péage…',
      primary: (r: Row) => MISC_LABELS[(r as unknown as CarMisc).kind],
      secondary: (r: Row) => join(fmtDate(String(r.date)), r.note as string, r.missionId !== undefined && 'mission'),
      amount: (r: Row) => Number(r.amount),
      search: (r: Row) => join(MISC_LABELS[(r as unknown as CarMisc).kind], r.note as string),
    }),
    [],
  );
  return <RecordList config={config} />;
}

// ───────────── Assurance ─────────────

export function InsurancePage() {
  const all = useLiveQuery(() => db.insurances.toArray());
  const e = insuranceExpiry(all ?? [], today());
  const config = useMemo<ListConfig>(
    () => ({
      title: 'Assurance',
      addLabel: 'Nouvelle assurance',
      table: db.insurances,
      dateKey: 'start',
      emptyIcon: <ShieldCheck className="size-10" />,
      emptyText: `Une alerte s'affiche ${INSURANCE_ALERT_DAYS} jours avant la fin du contrat.`,
      fields: [
        { key: 'company', label: 'Compagnie', type: 'text', required: true, suggestions: ['SAA', 'CAAT', 'CAAR', 'CASH', 'Alliance Assurances', 'GAM', 'Trust', 'CIAR', 'Salama', 'AXA'] },
        { key: 'formula', label: 'Formule', type: 'text', suggestions: ['Tous risques', 'Tiers', 'Tiers + vol/incendie', 'Tiers + bris de glace'] },
        { key: 'amount', label: 'Montant', type: 'da', required: true },
        { key: 'start', label: 'Début', type: 'date', required: true, half: true },
        { key: 'end', label: 'Fin', type: 'date', required: true, half: true },
      ],
      defaults: () => ({ start: today(), end: addDays(addMonths(today(), 12), -1) }),
      onFieldChange: (f: FormState, key: string) => (key === 'start' && f.start ? { ...f, end: addDays(addMonths(String(f.start), 12), -1) } : f),
      validate: (r: Row) => (String(r.end) < String(r.start) ? 'La fin doit être après le début.' : null),
      primary: (r: Row) => join((r as unknown as Insurance).company, (r as unknown as Insurance).formula),
      secondary: (r: Row) => `du ${fmtDate(String(r.start))} au ${fmtDate(String(r.end))}`,
      amount: (r: Row) => Number(r.amount),
      search: (r: Row) => join(String(r.company), String(r.formula ?? '')),
    }),
    [],
  );
  const header = (
    <Card className={cx(e?.level === 'soon' && 'ring-2 ring-amber-400', e?.level === 'expired' && 'ring-2 ring-red-500')}>
      <ExpiryBadge e={e} label="Assurance" />
    </Card>
  );
  return <RecordList config={{ ...config, header }} />;
}

// ───────────── Contrôle technique et vignette ─────────────

export function ChecksPage() {
  const all = useLiveQuery(() => db.carChecks.toArray());
  const ct = checkExpiry(all ?? [], 'controle', today());
  const vi = checkExpiry(all ?? [], 'vignette', today());
  const config = useMemo<ListConfig>(
    () => ({
      title: 'Contrôle technique et vignette',
      addLabel: 'Nouveau contrôle / vignette',
      table: db.carChecks,
      dateKey: 'date',
      emptyIcon: <CalendarClock className="size-10" />,
      emptyText: `Alerte ${CHECK_ALERT_DAYS} jours avant l'échéance du contrôle technique ; rappel annuel pour la vignette.`,
      fields: [
        { key: 'kind', label: 'Type', type: 'select', required: true, options: Object.entries(CHECK_LABELS).map(([value, label]) => ({ value, label })) },
        { key: 'date', label: 'Date', type: 'date', required: true, half: true },
        { key: 'expires', label: 'Valable jusqu’au', type: 'date', required: true, half: true, hint: 'Proposé : 1 an après (modifiable).' },
        { key: 'price', label: 'Prix', type: 'da', required: true },
        { key: 'note', label: 'Note', type: 'text', placeholder: 'Centre, observations…' },
      ],
      defaults: () => ({ kind: 'controle', date: today(), expires: addMonths(today(), 12) }),
      onFieldChange: (f: FormState, key: string) => (key === 'date' && f.date ? { ...f, expires: addMonths(String(f.date), 12) } : f),
      validate: (r: Row) => (String(r.expires) < String(r.date) ? "L'échéance doit être après la date." : null),
      primary: (r: Row) => CHECK_LABELS[(r as unknown as CarCheck).kind],
      secondary: (r: Row) => join(fmtDate(String(r.date)), `jusqu'au ${fmtDate(String(r.expires))}`, r.note as string),
      amount: (r: Row) => Number(r.price),
      search: (r: Row) => join(CHECK_LABELS[(r as unknown as CarCheck).kind], r.note as string),
    }),
    [],
  );
  const header = (
    <Card className={cx('space-y-1', [ct, vi].some((x) => x && x.level !== 'ok') && 'ring-2 ring-amber-400')}>
      <ExpiryBadge e={ct} label="Contrôle technique" />
      <br />
      <ExpiryBadge e={vi} label="Vignette" />
    </Card>
  );
  return <RecordList config={{ ...config, header }} />;
}
