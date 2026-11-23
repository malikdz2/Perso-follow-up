import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, FileDown, Minus } from 'lucide-react';
import { db } from '../db/db';
import { fmtDate, fmtMonth, MONTHS_SHORT_FR, toISO, todayISO } from '../lib/dates';
import { fmtDA, fmtDays, fmtNum } from '../lib/format';
import { delta, previousMonth, recapFor, type Delta, type RecapData } from '../lib/recap';
import { downloadFile } from '../lib/backup';
import { cx } from '../lib/cx';
import { Button, Card, PageHeader, Select } from '../components/ui';

/** Écart avec le mois précédent : flèche ↑/↓ + valeur + % (jamais la couleur seule). */
function DeltaBadge({ d, unit = 'DA', goodWhenUp = false, neutral = false }: { d: Delta | null; unit?: 'DA' | 'j' | 'L' | 'L/100'; goodWhenUp?: boolean; neutral?: boolean }) {
  if (!d) return <span className="text-xs text-slate-400">—</span>;
  const fmt = (n: number) => (unit === 'DA' ? fmtDA(Math.abs(n)) : `${fmtNum(Math.abs(n))} ${unit}`);
  if (d.dir === 'same') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
        <Minus className="size-3.5" /> stable
      </span>
    );
  }
  const good = (d.dir === 'up') === goodWhenUp;
  const Icon = d.dir === 'up' ? ArrowUp : ArrowDown;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap', neutral ? 'text-slate-600 dark:text-slate-300' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{d.dir === 'up' ? 'hausse' : 'baisse'}</span>
      {d.dir === 'up' ? '+' : '−'}
      {fmt(d.diff)}
      {d.pct !== null && ` (${d.dir === 'up' ? '+' : '−'}${fmtNum(Math.abs(d.pct))} %)`}
    </span>
  );
}

function Line({ label, value, d }: { label: string; value: ReactNode; d?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <span className="text-right">
        <span className="font-semibold tabular-nums">{value}</span>
        {d !== undefined && <span className="block">{d}</span>}
      </span>
    </div>
  );
}

function Block({ title, total, children }: { title: string; total?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        {total}
      </div>
      {children}
    </Card>
  );
}

const tooltipStyle = { borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgb(0 0 0 / 0.15)', fontSize: 13 };

/** Dépenses par catégorie : barres horizontales d'une seule teinte (magnitude), noms et montants écrits. */
function CategoryBars({ data }: { data: RecapData['expenses']['byCategory'] }) {
  if (data.length === 0) return <p className="py-3 text-center text-sm text-slate-500">Aucune dépense quotidienne.</p>;
  return (
    <div className="text-slate-500 dark:text-slate-400" style={{ height: data.length * 36 + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 84, bottom: 4, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
          <Tooltip cursor={{ fill: 'rgb(148 163 184 / 0.15)' }} contentStyle={tooltipStyle} formatter={(v) => [fmtDA(Number(v)), 'Montant']} />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]} className="fill-emerald-600 dark:fill-emerald-400" isAnimationActive={false}>
            <LabelList dataKey="amount" position="right" formatter={(v) => fmtDA(Number(v))} className="fill-slate-700 text-xs dark:fill-slate-200" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Historique : total des dépenses des mois figés (une seule teinte, mois affiché accentué). */
function HistoryBars({ months, selected }: { months: { month: string; total: number }[]; selected: string }) {
  if (months.length < 2) return null;
  const data = months.map((m) => ({ ...m, label: MONTHS_SHORT_FR[Number(m.month.slice(5)) - 1] }));
  return (
    <Block title="Évolution des dépenses">
      <div className="h-44 text-slate-500 dark:text-slate-400">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'currentColor', strokeOpacity: 0.3 }} tick={{ fill: 'currentColor', fontSize: 11 }} />
            <YAxis width={40} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip cursor={{ fill: 'rgb(148 163 184 / 0.15)' }} contentStyle={tooltipStyle} labelFormatter={(_, p) => (p?.[0] ? fmtMonth(String(p[0].payload.month)) : '')} formatter={(v) => [fmtDA(Number(v)), 'Total']} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} className={d.month === selected ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-emerald-600/35 dark:fill-emerald-400/35'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Toutes dépenses confondues (quotidiennes, voiture, crèche, crédit).</p>
    </Block>
  );
}

export default function Recap() {
  const today = todayISO();
  const current = today.slice(0, 7);
  const [params, setParams] = useSearchParams();
  const stored = useLiveQuery(() => db.recaps.orderBy('month').reverse().toArray());
  const month = params.get('mois') ?? stored?.[0]?.month ?? current;
  const view = useLiveQuery(async () => {
    const [cur, prev] = await Promise.all([recapFor(month), recapFor(previousMonth(month))]);
    return { cur, prev };
  }, [month, stored?.length]);
  const [busy, setBusy] = useState(false);

  // Marque le récap comme consulté (fait disparaître le rappel « récap prêt »).
  useEffect(() => {
    const r = stored?.find((x) => x.month === month);
    if (r && !r.viewedAt) void db.recaps.update(month, { viewedAt: Date.now() });
  }, [stored, month]);

  if (!stored || !view) return null;
  const { cur, prev } = view;
  const c = cur.data;
  const p = prev.data;
  const rec = stored.find((x) => x.month === month);
  const options = [...new Set([current, ...stored.map((r) => r.month)])].sort().reverse();

  const exportPdf = async () => {
    setBusy(true);
    try {
      const { recapPdf } = await import('../lib/recapPdf');
      downloadFile(await recapPdf(c, p, cur.final), `recapitulatif-${month}.pdf`, 'application/pdf');
    } finally {
      setBusy(false);
    }
  };

  const catPrev = new Map(p.expenses.byCategory.map((x) => [x.name, x.amount]));
  const history = [...stored]
    .filter((r) => r.final)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((r) => ({ month: r.month, total: (r.data as RecapData).grandTotal }));

  return (
    <div className="space-y-3">
      <PageHeader title="Récapitulatif" back={false} />
      <div className="flex items-center gap-2">
        <Select aria-label="Mois du récapitulatif" value={month} onChange={(e) => setParams({ mois: e.target.value }, { replace: true })} className="capitalize">
          {options.map((m) => (
            <option key={m} value={m}>
              {fmtMonth(m)}
              {m === current && !stored.some((r) => r.month === m) ? ' (en cours)' : ''}
            </option>
          ))}
        </Select>
      </div>
      <p
        className={cx(
          'rounded-xl px-3 py-2 text-sm',
          cur.final ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        )}
      >
        {cur.final && rec
          ? `🔒 Figé le ${fmtDate(toISO(new Date(rec.createdAt)))} — comparé à ${fmtMonth(previousMonth(month))}.`
          : rec
            ? '⏳ Provisoire : généré le dernier jour du mois, il sera figé à la prochaine ouverture.'
            : `👀 Aperçu du mois en cours (non figé). Le récapitulatif sera généré le dernier jour du mois.`}
      </p>

      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">Total de toutes les dépenses</p>
        <p className="text-3xl font-bold tabular-nums">{fmtDA(c.grandTotal)}</p>
        <DeltaBadge d={delta(c.grandTotal, p.grandTotal)} />
      </Card>

      <Block title="Dépenses quotidiennes" total={<span className="font-bold tabular-nums">{fmtDA(c.expenses.total)}</span>}>
        <div className="mb-2 text-right">
          <DeltaBadge d={delta(c.expenses.total, p.expenses.total)} />
        </div>
        <CategoryBars data={c.expenses.byCategory} />
        {c.expenses.byCategory.length > 0 && (
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Dépenses par catégorie et écart avec le mois précédent</caption>
            <thead className="sr-only">
              <tr>
                <th>Catégorie</th>
                <th>Montant</th>
                <th>Écart</th>
              </tr>
            </thead>
            <tbody>
              {c.expenses.byCategory.map((x) => (
                <tr key={x.name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5">
                    <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: x.color }} />
                    {x.name}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{fmtDA(x.amount)}</td>
                  <td className="py-1.5 pl-2 text-right">
                    <DeltaBadge d={delta(x.amount, catPrev.get(x.name) ?? 0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Block>

      <Block title="Voiture" total={<span className="font-bold tabular-nums">{fmtDA(c.car.total)}</span>}>
        <Line label="Carburant" value={fmtDA(c.car.fuelAmount)} d={<DeltaBadge d={delta(c.car.fuelAmount, p.car.fuelAmount)} />} />
        <Line label="Litres" value={`${fmtNum(c.car.fuelLiters)} L`} d={<DeltaBadge d={delta(c.car.fuelLiters, p.car.fuelLiters)} unit="L" />} />
        <Line label="Consommation" value={c.car.consumption !== null ? `${fmtNum(c.car.consumption)} L/100` : '—'} d={<DeltaBadge d={delta(c.car.consumption, p.car.consumption)} unit="L/100" />} />
        <Line label="Entretien" value={fmtDA(c.car.maintenance)} d={<DeltaBadge d={delta(c.car.maintenance, p.car.maintenance)} />} />
        {c.car.other > 0 && <Line label="Assurance, contrôles, accessoires, divers" value={fmtDA(c.car.other)} />}
        {c.car.loanRemaining !== null && (
          <>
            <Line label="Crédit payé ce mois" value={fmtDA(c.car.loanPaid)} />
            <Line label="Crédit restant" value={fmtDA(c.car.loanRemaining)} d={<DeltaBadge d={delta(c.car.loanRemaining, p.car.loanRemaining)} neutral />} />
          </>
        )}
      </Block>

      <Block title="Crèche">
        <Line label="Payé pour ce mois" value={fmtDA(c.daycare.paid)} d={<DeltaBadge d={delta(c.daycare.paid, p.daycare.paid)} neutral />} />
        {c.daycare.monthlyPaid !== null && <Line label="Mensualité" value={c.daycare.monthlyPaid ? '✓ payée' : '✗ non payée'} />}
      </Block>

      <Block title="Travail">
        <Line label="Jours travaillés" value={fmtDays(c.work.worked)} d={<DeltaBadge d={delta(c.work.worked, p.work.worked)} unit="j" goodWhenUp />} />
        <Line label="Jours de mission" value={fmtDays(c.work.mission)} d={<DeltaBadge d={delta(c.work.mission, p.work.mission)} unit="j" goodWhenUp />} />
        {(c.work.conge > 0 || c.work.recup > 0 || c.work.rc > 0 || c.work.absence > 0) && (
          <Line label="Congé · récup. · RC · absence" value={`${c.work.conge} · ${c.work.recup} · ${c.work.rc} · ${c.work.absence}`} />
        )}
        <div className="mt-1 border-t border-slate-100 pt-2 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">Wilayas visitées : {c.work.wilayas.length}</p>
          {c.work.wilayas.length > 0 && <p className="text-sm">{c.work.wilayas.map((w) => `${String(w.code).padStart(2, '0')} ${w.name} (${w.days} j)`).join(' · ')}</p>}
        </div>
      </Block>

      <Block title="Soldes en fin de mois">
        <Line label="Congé" value={fmtDays(c.balances.conge)} d={<DeltaBadge d={delta(c.balances.conge, p.balances.conge)} unit="j" goodWhenUp />} />
        <Line label="Récupération" value={fmtDays(c.balances.recup)} d={<DeltaBadge d={delta(c.balances.recup, p.balances.recup)} unit="j" goodWhenUp />} />
        <Line label="RC" value={fmtDays(c.balances.rc)} d={<DeltaBadge d={delta(c.balances.rc, p.balances.rc)} unit="j" goodWhenUp />} />
      </Block>

      <HistoryBars months={history} selected={month} />

      <Button block onClick={() => void exportPdf()} disabled={busy}>
        <FileDown className="size-5" /> {busy ? 'Création…' : 'Exporter en PDF'}
      </Button>
      <p className="pb-2 text-center text-xs text-slate-500 dark:text-slate-400">Flèches : comparaison avec {fmtMonth(previousMonth(month))}.</p>
    </div>
  );
}
