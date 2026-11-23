import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { db, type LoanPayment } from '../../db/db';
import { MONTHS_FR, deMonth, fmtDate, monthKey, todayISO } from '../../lib/dates';
import { fmtDA, parseDA, parseNum } from '../../lib/format';
import { loanStatus } from '../../lib/car';
import { cx } from '../../lib/cx';
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Sheet } from '../../components/ui';
import { CreditCard } from 'lucide-react';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3 py-1', strong ? 'font-bold' : 'text-sm')}>
      <span className={strong ? '' : 'text-slate-500 dark:text-slate-400'}>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

interface LoanForm {
  amount: string;
  monthly: string;
  startDate: string;
  months: string;
  lender: string;
}

function LoanSheet({ initial, id, onClose }: { initial: LoanForm; id?: number; onClose: () => void }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const save = async () => {
    const loan = { amount: parseDA(f.amount), monthly: parseDA(f.monthly), startDate: f.startDate, months: Math.round(parseNum(f.months) || 0), lender: f.lender.trim() || undefined };
    if (!loan.amount || !loan.monthly) return setError('Indiquez le montant emprunté et la mensualité.');
    if (!loan.startDate) return setError('Indiquez la date de la première mensualité.');
    if (!(loan.months > 0)) return setError('Indiquez la durée en mois.');
    if (id !== undefined) await db.carLoans.update(id, loan);
    else await db.carLoans.add(loan);
    onClose();
  };
  const set = (k: keyof LoanForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open onClose={onClose} title={id !== undefined ? 'Modifier le crédit' : 'Nouveau crédit'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant emprunté (DA)">
          <Input inputMode="numeric" value={f.amount} onChange={set('amount')} />
        </Field>
        <Field label="Mensualité (DA)">
          <Input inputMode="numeric" value={f.monthly} onChange={set('monthly')} />
        </Field>
        <Field label="1re mensualité">
          <Input type="date" value={f.startDate} onChange={set('startDate')} />
        </Field>
        <Field label="Durée (mois)">
          <Input inputMode="numeric" value={f.months} onChange={set('months')} />
        </Field>
        <div className="col-span-2">
          <Field label="Banque (facultatif)">
            <Input value={f.lender} onChange={set('lender')} />
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

function PaymentSheet({ initial, loanId, onClose }: { initial: Partial<LoanPayment>; loanId: number; onClose: () => void }) {
  const [date, setDate] = useState(initial.date ?? todayISO());
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const [note, setNote] = useState(initial.note ?? '');
  const save = async () => {
    const p = { loanId, date, amount: parseDA(amount), note: note.trim() || undefined };
    if (!p.amount || !date) return;
    if (initial.id !== undefined) await db.loanPayments.update(initial.id, p);
    else await db.loanPayments.add(p);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={initial.id !== undefined ? 'Modifier le paiement' : 'Nouveau paiement'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Montant (DA)">
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Note (facultatif)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
      <Button block className="mt-4" onClick={() => void save()} disabled={!parseDA(amount) || !date}>
        Enregistrer
      </Button>
      {initial.id !== undefined && (
        <Button
          block
          variant="ghost"
          className="mt-1 text-red-600 dark:text-red-400"
          onClick={async () => {
            await db.loanPayments.delete(initial.id!);
            onClose();
          }}
        >
          <Trash2 className="size-4" /> Supprimer
        </Button>
      )}
    </Sheet>
  );
}

export default function LoanPage() {
  const today = todayISO();
  const data = useLiveQuery(async () => {
    const loan = await db.carLoans.toCollection().first();
    const payments = loan ? await db.loanPayments.where('loanId').equals(loan.id!).toArray() : [];
    return { loan, payments: payments.sort((a, b) => b.date.localeCompare(a.date)) };
  });
  const [editLoan, setEditLoan] = useState(false);
  const [payment, setPayment] = useState<Partial<LoanPayment> | null>(null);
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');

  if (!data) return null;
  const { loan, payments } = data;

  if (!loan) {
    return (
      <div className="space-y-4">
        <PageHeader title="Crédit voiture" />
        <EmptyState icon={<CreditCard className="size-10" />} title="Aucun crédit">
          Ajoutez votre crédit pour suivre le reste à payer et recevoir un rappel chaque mois.
        </EmptyState>
        <Button block onClick={() => setEditLoan(true)}>
          Ajouter un crédit
        </Button>
        {editLoan && <LoanSheet initial={{ amount: '', monthly: '', startDate: today, months: '', lender: '' }} onClose={() => setEditLoan(false)} />}
      </div>
    );
  }

  const s = loanStatus(loan, payments, today);
  const years = [...new Set(payments.map((p) => p.date.slice(0, 4)))].sort().reverse();
  const shown = payments.filter((p) => (year === 'all' || p.date.startsWith(year)) && (month === 'all' || p.date.slice(5, 7) === month));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Crédit voiture"
        action={
          <button type="button" aria-label="Modifier le crédit" onClick={() => setEditLoan(true)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800">
            <Pencil className="size-5" />
          </button>
        }
      />

      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">Reste à payer</p>
        <p className="text-3xl font-bold tabular-nums">{fmtDA(s.remaining)}</p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(s.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${s.progress * 100}%` }} />
        </div>
        <p className="mt-1 flex justify-between text-sm">
          <span>{Math.round(s.progress * 100)} % remboursé</span>
          <span>
            <strong>{s.remainingCount}</strong> mensualité{s.remainingCount > 1 ? 's' : ''} restante{s.remainingCount > 1 ? 's' : ''} / {loan.months}
          </span>
        </p>
      </Card>

      {!s.finished && (
        <Card className={cx(s.overdue && !s.paidThisMonth && 'ring-2 ring-amber-400')}>
          {s.paidThisMonth ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-5" /> Mensualité {deMonth(monthKey(today))} payée.
            </p>
          ) : (
            <p className="text-sm">
              {s.overdue ? '⚠️ Mensualité en attente' : 'Prochaine mensualité'} : <strong>{fmtDA(loan.monthly)}</strong> — échéance du {fmtDate(s.nextDue)}
            </p>
          )}
          <Button block className="mt-3" variant={s.paidThisMonth ? 'secondary' : 'primary'} onClick={() => setPayment({ date: today, amount: loan.monthly })}>
            Enregistrer un paiement
          </Button>
        </Card>
      )}

      <Card>
        <Row label="Montant emprunté" value={fmtDA(loan.amount)} />
        <Row label="Mensualité" value={fmtDA(loan.monthly)} />
        <Row label="Durée" value={`${loan.months} mois (dès le ${fmtDate(loan.startDate)})`} />
        {loan.lender && <Row label="Banque" value={loan.lender} />}
        <Row label="Total à rembourser" value={fmtDA(s.totalDue)} />
        <Row label="Coût du crédit" value={fmtDA(s.interest)} />
        <Row label="Déjà payé" value={fmtDA(s.paid)} strong />
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Paiements ({payments.length})</h2>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Année" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">Toutes années</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
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
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPayment(p)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800">
                <span className="flex-1">
                  {fmtDate(p.date)}
                  {p.note && <span className="block text-xs text-slate-500 dark:text-slate-400">{p.note}</span>}
                </span>
                <span className="font-semibold tabular-nums">{fmtDA(p.amount)}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="p-4 text-center text-sm text-slate-500">Aucun paiement.</li>}
        </ul>
      </section>

      {editLoan && (
        <LoanSheet
          id={loan.id}
          initial={{ amount: String(loan.amount), monthly: String(loan.monthly), startDate: loan.startDate, months: String(loan.months), lender: loan.lender ?? '' }}
          onClose={() => setEditLoan(false)}
        />
      )}
      {payment && <PaymentSheet initial={payment} loanId={loan.id!} onClose={() => setPayment(null)} />}
    </div>
  );
}
