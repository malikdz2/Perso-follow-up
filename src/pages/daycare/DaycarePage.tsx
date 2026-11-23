import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Baby, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { db, type Daycare, type DaycarePayment } from '../../db/db';
import { MONTHS_SHORT_FR, fmtDate, fmtMonth, todayISO } from '../../lib/dates';
import { fmtDA, parseDA, parseNum } from '../../lib/format';
import { daycareYear, unpaidDaycareMonths, type DaycareMonthStatus } from '../../lib/budget';
import { cx } from '../../lib/cx';
import { DAYCARE_TYPES, daycarePaymentForm } from '../../components/forms';
import { RecordList, RecordSheet, type ListConfig, type Row } from '../../components/RecordList';
import { toForm } from '../../components/recordForm';
import { Button, Card, Field, Input, Sheet } from '../../components/ui';

const STATUS: Record<DaycareMonthStatus, { label: string; cls: string }> = {
  paye: { label: 'Payé', cls: 'bg-emerald-600 text-white' },
  partiel: { label: 'Partiel', cls: 'bg-amber-400 text-amber-950' },
  a_payer: { label: 'À payer', cls: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800' },
  en_retard: { label: 'En retard', cls: 'bg-red-500 text-white' },
  a_venir: { label: 'À venir', cls: 'bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800' },
  hors: { label: '—', cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800/50' },
};

function DaycareSheet({ initial, onClose }: { initial?: Daycare; onClose: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    childName: initial?.childName ?? '',
    monthly: initial?.monthly ? String(initial.monthly) : '',
    payDay: String(initial?.payDay ?? 5),
    startMonth: initial?.startMonth ?? todayISO().slice(0, 7),
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const payDay = Math.round(parseNum(f.payDay));
    if (!f.name.trim()) return setError('Indiquez le nom de la crèche.');
    if (!(payDay >= 1 && payDay <= 31)) return setError('Le jour de paiement doit être entre 1 et 31.');
    const d = { name: f.name.trim(), childName: f.childName.trim() || undefined, monthly: parseDA(f.monthly), payDay, startMonth: f.startMonth || undefined };
    if (initial?.id !== undefined) await db.daycare.update(initial.id, d);
    else await db.daycare.add(d);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Crèche">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Nom de la crèche">
            <Input value={f.name} onChange={set('name')} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Prénom de l'enfant (facultatif)">
            <Input value={f.childName} onChange={set('childName')} />
          </Field>
        </div>
        <Field label="Mensualité (DA)">
          <Input inputMode="numeric" value={f.monthly} onChange={set('monthly')} />
        </Field>
        <Field label="Jour de paiement">
          <Input inputMode="numeric" value={f.payDay} onChange={set('payDay')} />
        </Field>
        <div className="col-span-2">
          <Field label="Premier mois de crèche" hint="Les mois précédents ne sont pas comptés « à payer ».">
            <Input type="month" value={f.startMonth} onChange={set('startMonth')} />
          </Field>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
      <Button block className="mt-4" onClick={() => void save()}>
        Enregistrer
      </Button>
    </Sheet>
  );
}

function MonthsGrid({ daycare, payments, onPay }: { daycare: Daycare; payments: DaycarePayment[]; onPay: (month: string) => void }) {
  const today = todayISO();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const months = daycareYear(daycare, payments, year, today);
  const total = payments.filter((p) => p.month.startsWith(String(year))).reduce((s, p) => s + p.amount, 0);
  return (
    <Card className="space-y-3">
      <div className="flex items-center">
        <button type="button" aria-label="Année précédente" onClick={() => setYear(year - 1)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800">
          <ChevronLeft className="size-5" />
        </button>
        <p className="flex-1 text-center font-bold">
          {year} <span className="font-normal text-slate-500 dark:text-slate-400">· {fmtDA(total)} payés</span>
        </p>
        <button type="button" aria-label="Année suivante" onClick={() => setYear(year + 1)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {months.map((m, i) => (
          <button
            key={m.month}
            type="button"
            disabled={m.status === 'hors'}
            onClick={() => onPay(m.month)}
            aria-label={`${fmtMonth(m.month)} : ${STATUS[m.status].label}`}
            className={cx('flex min-h-16 flex-col items-center justify-center rounded-xl px-1 text-center', STATUS[m.status].cls, m.month === today.slice(0, 7) && 'outline-2 outline-offset-2 outline-emerald-600')}
          >
            <span className="text-sm font-semibold capitalize">{MONTHS_SHORT_FR[i]}</span>
            <span className="text-xs">{STATUS[m.status].label}</span>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">Touchez un mois pour enregistrer son paiement.</p>
    </Card>
  );
}

export default function DaycarePage() {
  const data = useLiveQuery(async () => ({ daycare: await db.daycare.toCollection().first(), payments: await db.daycarePayments.toArray() }));
  const [edit, setEdit] = useState(false);
  const [payMonth, setPayMonth] = useState<string | null>(null);
  const today = todayISO();

  const config = useMemo<ListConfig | null>(() => {
    if (!data) return null;
    return {
      ...daycarePaymentForm(data.daycare),
      title: 'Crèche',
      emptyIcon: <Baby className="size-10" />,
      emptyText: 'Touchez un mois ci-dessus ou « Ajouter » pour enregistrer un paiement.',
      primary: (r: Row) => `${DAYCARE_TYPES[(r as unknown as DaycarePayment).type]} — ${fmtMonth(String(r.month))}`,
      secondary: (r: Row) => [`payé le ${fmtDate(String(r.date))}`, r.note as string].filter(Boolean).join(' · '),
      amount: (r: Row) => Number(r.amount),
      search: (r: Row) => `${DAYCARE_TYPES[(r as unknown as DaycarePayment).type]} ${fmtMonth(String(r.month))} ${r.note ?? ''}`,
    };
  }, [data]);

  if (!data || !config) return null;
  const { daycare, payments } = data;
  const unpaid = daycare ? unpaidDaycareMonths(daycare, payments, today) : [];

  const header = daycare ? (
    <>
      <Card className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300">
          <Baby className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{daycare.name}{daycare.childName ? ` — ${daycare.childName}` : ''}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {fmtDA(daycare.monthly)} / mois · paiement le {daycare.payDay}
          </p>
        </div>
        <button type="button" aria-label="Modifier la crèche" onClick={() => setEdit(true)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800">
          <Pencil className="size-5" />
        </button>
      </Card>
      {unpaid.map((m) => (
        <button
          key={m.month}
          type="button"
          onClick={() => setPayMonth(m.month)}
          className={cx(
            'flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium',
            m.status === 'en_retard' ? 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
          )}
        >
          {m.status === 'en_retard' ? '⚠️ En retard' : m.status === 'partiel' ? '◐ Partiel' : '🔔 À payer'} : {fmtMonth(m.month)} — échéance le {fmtDate(m.due)}
          {m.status === 'partiel' ? ` (reste ${fmtDA(daycare.monthly - m.paid)})` : ''}
        </button>
      ))}
      <MonthsGrid daycare={daycare} payments={payments} onPay={setPayMonth} />
    </>
  ) : (
    <Card>
      <p className="mb-3 text-sm">Renseignez la crèche pour suivre les mois payés et recevoir un rappel.</p>
      <Button block onClick={() => setEdit(true)}>
        Renseigner la crèche
      </Button>
    </Card>
  );

  const paidOf = (month: string) => payments.filter((p) => p.month === month && p.type === 'mensualite').reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <RecordList config={{ ...config, header }} />
      {edit && <DaycareSheet initial={daycare} onClose={() => setEdit(false)} />}
      {payMonth && (
        <RecordSheet
          config={config}
          initial={{
            form: toForm(config.fields, {
              type: 'mensualite',
              month: payMonth,
              amount: Math.max(0, (daycare?.monthly ?? 0) - paidOf(payMonth)) || daycare?.monthly,
              date: today,
            }),
          }}
          banner={`Paiement pour ${fmtMonth(payMonth)}`}
          onClose={() => setPayMonth(null)}
        />
      )}
    </>
  );
}
