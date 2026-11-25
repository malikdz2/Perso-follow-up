import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CalendarClock, Car, CreditCard, FileImage, Fuel, Package, Pencil, ScanSearch, ShieldCheck, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { db } from '../../db/db';
import { useSettings } from '../../db/settings';
import { fmtDate, fmtMonth, monthKey, todayISO } from '../../lib/dates';
import { fmtDA, fmtNum } from '../../lib/format';
import { checkExpiry, currentKm, fuelStats, insuranceExpiry, loanStatus, nextOilChange, realCost, type Expiry } from '../../lib/car';
import { cx } from '../../lib/cx';
import { Button, Card, PageHeader } from '../../components/ui';

function Tile({ to, icon: Icon, title, children, alert }: { to: string; icon: LucideIcon; title: string; children: ReactNode; alert?: boolean }) {
  return (
    <Link
      to={to}
      className={cx(
        'flex min-h-28 flex-col gap-1 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:active:bg-slate-800',
        alert && 'ring-2 ring-amber-400 dark:ring-amber-500',
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-5 text-sky-600 dark:text-sky-400" /> {title}
      </span>
      <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </Link>
  );
}

const expiryText = (e: Expiry | null) =>
  !e ? 'Non renseigné' : e.level === 'expired' ? `Expiré le ${fmtDate(e.date)}` : `Jusqu'au ${fmtDate(e.date)}${e.level === 'soon' ? ` (J-${e.daysLeft})` : ''}`;

export default function CarHome() {
  const settings = useSettings();
  const navigate = useNavigate();
  const today = todayISO();
  const month = monthKey(today);
  const d = useLiveQuery(async () => {
    const [vehicle, loan, fuel, maintenance, accessories, insurances, checks, misc, docs] = await Promise.all([
      db.vehicle.toCollection().first(),
      db.carLoans.toCollection().first(),
      db.fuel.toArray(),
      db.maintenance.toArray(),
      db.accessories.toArray(),
      db.insurances.toArray(),
      db.carChecks.toArray(),
      db.carMisc.toArray(),
      db.carDocs.count(),
    ]);
    const payments = loan ? await db.loanPayments.where('loanId').equals(loan.id!).toArray() : [];
    return { vehicle, loan, payments, fuel, maintenance, accessories, insurances, checks, misc, docs };
  });
  if (!d || !settings) return null;

  const inMonth = <T extends { date: string }>(rows: T[]) => rows.filter((r) => r.date.startsWith(month));
  const fs = fuelStats(d.fuel);
  const fuelMonth = fuelStats(inMonth(d.fuel));
  const km = currentKm(d.vehicle, d.fuel, d.maintenance);
  const oil = nextOilChange(d.maintenance, settings.oilInterval, km);
  const loan = d.loan ? loanStatus(d.loan, d.payments, today) : null;
  const ins = insuranceExpiry(d.insurances, today);
  const ct = checkExpiry(d.checks, 'controle', today);
  const vi = checkExpiry(d.checks, 'vignette', today);
  const cost = realCost({ ...d });
  const monthTotal =
    fuelMonth.amount +
    inMonth(d.maintenance).reduce((s, r) => s + r.price, 0) +
    inMonth(d.accessories).reduce((s, r) => s + r.price, 0) +
    inMonth(d.misc).reduce((s, r) => s + r.amount, 0) +
    inMonth(d.checks).reduce((s, r) => s + r.price, 0) +
    d.insurances.filter((i) => i.start.startsWith(month)).reduce((s, r) => s + r.amount, 0);

  const alerts: { text: string; to: string; danger?: boolean }[] = [];
  if (ins && ins.level !== 'ok') alerts.push({ text: ins.level === 'expired' ? `Assurance expirée depuis le ${fmtDate(ins.date)}` : `Assurance : fin dans ${ins.daysLeft} j (${fmtDate(ins.date)})`, to: '/voiture/assurance', danger: ins.level === 'expired' });
  if (ct && ct.level !== 'ok') alerts.push({ text: ct.level === 'expired' ? 'Contrôle technique expiré' : `Contrôle technique dans ${ct.daysLeft} j`, to: '/voiture/controles', danger: ct.level === 'expired' });
  if (vi && vi.level !== 'ok') alerts.push({ text: vi.level === 'expired' ? 'Vignette à renouveler' : `Vignette dans ${vi.daysLeft} j`, to: '/voiture/controles', danger: vi.level === 'expired' });
  if (oil?.remaining !== null && oil?.remaining !== undefined && oil.remaining <= 1000)
    alerts.push({ text: oil.remaining < 0 ? `Vidange dépassée de ${fmtNum(-oil.remaining)} km` : `Vidange dans ${fmtNum(oil.remaining)} km`, to: '/voiture/entretien', danger: oil.remaining < 0 });
  if (loan && !loan.finished && !loan.paidThisMonth && loan.nextDue && loan.nextDue <= today) alerts.push({ text: `Mensualité du crédit à payer (${fmtDA(d.loan!.monthly)})`, to: '/voiture/credit' });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Voiture"
        action={
          <Link to="/voiture/vehicule" aria-label="Modifier le véhicule" className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800">
            <Pencil className="size-5" />
          </Link>
        }
      />

      {d.vehicle ? (
        <Card className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            <Car className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{d.vehicle.model}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{[d.vehicle.plate, km !== null && `${fmtNum(km)} km`].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="mb-2 text-sm">Aucun véhicule enregistré.</p>
          <Button block onClick={() => navigate('/voiture/vehicule')}>
            Ajouter mon véhicule
          </Button>
        </Card>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.text}
              to={a.to}
              className={cx(
                'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
                a.danger ? 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
              )}
            >
              <AlertTriangle className="size-4 shrink-0" /> {a.text}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <p className="text-sm text-slate-500 capitalize dark:text-slate-400">Voiture — {fmtMonth(month)}</p>
        <p className="text-2xl font-bold tabular-nums">{fmtDA(monthTotal)}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          dont carburant {fmtDA(fuelMonth.amount)} ({fmtNum(fuelMonth.liters)} L){loan && !loan.finished ? ` · crédit ${fmtDA(d.loan!.monthly)}/mois en plus` : ''}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Tile to="/voiture/carburant" icon={Fuel} title="Carburant">
          {fs.average !== null ? <strong className="text-base text-slate-900 dark:text-slate-100">{fmtNum(fs.average)} L/100</strong> : 'Conso. : —'}
          {fs.costPerKm !== null && <p>{fmtNum(fs.costPerKm)} DA/km</p>}
        </Tile>
        <Tile to="/voiture/entretien" icon={Wrench} title="Entretien" alert={oil?.remaining !== null && oil !== null && oil.remaining! <= 1000}>
          {oil ? (
            <>
              Vidange à <strong>{fmtNum(oil.nextKm)} km</strong>
              {oil.remaining !== null && <p>{oil.remaining < 0 ? 'dépassée' : `encore ${fmtNum(oil.remaining)} km`}</p>}
            </>
          ) : (
            'Aucune vidange enregistrée'
          )}
        </Tile>
        <Tile to="/voiture/credit" icon={CreditCard} title="Crédit" alert={!!loan && !loan.paidThisMonth && !!loan.nextDue && loan.nextDue <= today}>
          {loan ? (
            <>
              Reste <strong>{fmtDA(loan.remaining)}</strong>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full bg-emerald-600" style={{ width: `${loan.progress * 100}%` }} />
              </div>
              <p className="text-xs">{loan.remainingCount} mensualités restantes</p>
            </>
          ) : (
            'Aucun crédit'
          )}
        </Tile>
        <Tile to="/voiture/assurance" icon={ShieldCheck} title="Assurance" alert={!!ins && ins.level !== 'ok'}>
          {ins ? <p>{ins.insurance.company}</p> : null}
          <p className="text-xs">{expiryText(ins)}</p>
        </Tile>
        <Tile to="/voiture/controles" icon={CalendarClock} title="Contrôle & vignette" alert={[ct, vi].some((x) => x && x.level !== 'ok')}>
          <p className="text-xs">CT : {expiryText(ct)}</p>
          <p className="text-xs">Vignette : {expiryText(vi)}</p>
        </Tile>
        <Tile to="/voiture/accessoires" icon={Package} title="Accessoires">
          {fmtDA(cost.accessories)} au total
        </Tile>
        <Tile to="/voiture/divers" icon={Sparkles} title="Divers">
          Lavage, parking, amende, péage
          <p className="text-xs">ce mois : {fmtDA(inMonth(d.misc).reduce((s, r) => s + r.amount, 0))}</p>
        </Tile>
        <Tile to="/voiture/etats-des-lieux" icon={ScanSearch} title="États des lieux">
          Photos départ / retour
          <p className="text-xs">nouvelles rayures détectées</p>
        </Tile>
        <Tile to="/voiture/documents" icon={FileImage} title="Documents">
          {d.docs} photo{d.docs > 1 ? 's' : ''}
          <p className="text-xs">Carte grise, assurance, permis</p>
        </Tile>
      </div>

      <Card>
        <p className="font-semibold">Coût total réel</p>
        <p className="text-2xl font-bold tabular-nums">{fmtDA(cost.total)}</p>
        <div className="mt-2 space-y-0.5 text-sm">
          {(
            [
              ["Prix d'achat", cost.purchase],
              ['Coût du crédit (intérêts)', cost.interest],
              ['Carburant', cost.fuel],
              ['Entretien', cost.maintenance],
              ['Assurance', cost.insurance],
              ['Contrôle technique et vignette', cost.checks],
              ['Accessoires', cost.accessories],
              ['Divers', cost.misc],
            ] as const
          )
            .filter(([, n]) => n > 0)
            .map(([label, n]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="tabular-nums">{fmtDA(n)}</span>
              </div>
            ))}
        </div>
        {km !== null && d.vehicle?.initialKm && km > d.vehicle.initialKm && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Hors achat : {fmtNum(Math.round(((cost.total - cost.purchase) / (km - d.vehicle.initialKm)) * 100) / 100)} DA/km sur {fmtNum(km - d.vehicle.initialKm)} km parcourus.
          </p>
        )}
      </Card>
    </div>
  );
}
