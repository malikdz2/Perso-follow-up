import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { db, type MissionFee, type MissionFeeKind } from '../db/db';
import { getSettings } from '../db/settings';
import { WILAYA_BY_CODE, wilayaLabel } from '../data/wilayas';
import { fmtDate } from '../lib/dates';
import { downloadFile } from '../lib/backup';
import { fmtDA, fmtDays, parseDA } from '../lib/format';
import { FEE_LABELS, deleteMission, missionDays } from '../lib/missions';
import type { LinkedExpense } from '../lib/pdf';
import { Button, Card, Field, Input, PageHeader, Sheet } from '../components/ui';
import { cx } from '../lib/cx';

interface FeeForm {
  id?: number;
  date: string;
  kind: MissionFeeKind;
  amount: string;
  note: string;
}

function FeeSheet({ initial, missionId, min, max, onClose }: { initial: FeeForm; missionId: number; min: string; max: string; onClose: () => void }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const save = async () => {
    const amount = parseDA(f.amount);
    if (!amount) return setError('Indiquez le montant.');
    if (!f.date) return setError('Indiquez la date.');
    const fee = { missionId, date: f.date, kind: f.kind, amount, note: f.note.trim() || undefined };
    if (f.id) await db.missionFees.update(f.id, fee);
    else await db.missionFees.add(fee);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={f.id ? 'Modifier le frais' : 'Ajouter un frais'}>
      <div className="space-y-3">
        <Field label="Nature" group>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FEE_LABELS) as MissionFeeKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={f.kind === k}
                onClick={() => setF({ ...f, kind: k })}
                className={cx(
                  'min-h-11 rounded-xl text-sm font-semibold ring-1',
                  f.kind === k ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-slate-50 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700',
                )}
              >
                {FEE_LABELS[k]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (DA)">
            <Input inputMode="numeric" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label="Date">
            <Input type="date" min={min} max={max} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
        <Field label="Note (facultatif)">
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex. : hôtel 2 nuits" />
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
              await db.missionFees.delete(f.id!);
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${strong ? 'text-base font-bold' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-slate-500 dark:text-slate-400'}>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

export default function MissionDetail() {
  const { id } = useParams();
  const missionId = Number(id);
  const navigate = useNavigate();
  const [fee, setFee] = useState<FeeForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const data = useLiveQuery(async () => {
    const mission = await db.missions.get(missionId);
    if (!mission) return { mission: null };
    const [fees, expenses, fuel, misc, recupMoves, categories] = await Promise.all([
      db.missionFees.where('missionId').equals(missionId).sortBy('date'),
      db.expenses.where('missionId').equals(missionId).toArray(),
      db.fuel.where('missionId').equals(missionId).toArray(),
      db.carMisc.where('missionId').equals(missionId).toArray(),
      db.balanceMoves.where('autoKey').between(`cal-${mission.start}`, `cal-${mission.end}`, true, true).filter((m) => m.type === 'recup' && m.days > 0).toArray(),
      db.categories.toArray(),
    ]);
    const catName = new Map(categories.map((c) => [c.id!, c.name]));
    const linked: LinkedExpense[] = [
      ...expenses.map((e) => ({ date: e.date, label: `${catName.get(e.categoryId) ?? 'Dépense'}${e.note ? ` — ${e.note}` : ''}`, amount: e.amount })),
      ...fuel.map((e) => ({ date: e.date, label: `Carburant${e.station ? ` — ${e.station}` : ''} (${e.liters} L)`, amount: e.amount })),
      ...misc.map((e) => ({ date: e.date, label: `Voiture — ${e.kind}${e.note ? ` (${e.note})` : ''}`, amount: e.amount })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return { mission, fees, linked, recup: recupMoves.reduce((s, m) => s + m.days, 0) };
  }, [missionId]);

  if (!data) return null;
  if (!data.mission) {
    return (
      <div>
        <PageHeader title="Mission" />
        <p className="text-center text-slate-500">Mission introuvable.</p>
      </div>
    );
  }
  const { mission: m, fees = [], linked = [], recup = 0 } = data;
  const w = WILAYA_BY_CODE.get(m.wilaya);
  const totalFees = fees.reduce((s, f) => s + f.amount, 0) + linked.reduce((s, l) => s + l.amount, 0);
  const rest = totalFees - m.reimbursed;
  const byKind = (Object.keys(FEE_LABELS) as MissionFeeKind[]).map((k) => [k, fees.filter((f) => f.kind === k).reduce((s, f) => s + f.amount, 0)] as const).filter(([, n]) => n > 0);

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const { missionExpensePdf } = await import('../lib/pdf');
      const blob = await missionExpensePdf(m, fees, linked, await getSettings());
      const slug = (w?.name ?? 'mission').normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase();
      downloadFile(blob, `note-de-frais-${slug}-${m.start}.pdf`, 'application/pdf');
    } finally {
      setPdfBusy(false);
    }
  };

  const openFee = (f?: MissionFee) =>
    setFee(f ? { id: f.id, date: f.date, kind: f.kind, amount: String(f.amount), note: f.note ?? '' } : { date: m.start, kind: 'repas', amount: '', note: '' });

  return (
    <div className="space-y-4">
      <PageHeader
        title={wilayaLabel(m.wilaya)}
        action={
          <button
            type="button"
            aria-label="Modifier la mission"
            onClick={() => navigate(`/missions/${m.id}/modifier`)}
            className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800"
          >
            <Pencil className="size-5" />
          </button>
        }
      />

      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Chef-lieu : {w?.capital} · {w?.nameAr}
        </p>
        <p className="mt-1 text-lg font-semibold">{m.start === m.end ? `Le ${fmtDate(m.start)}` : `Du ${fmtDate(m.start)} au ${fmtDate(m.end)}`}</p>
        <p className="text-sm">
          {missionDays(m)} jour{missionDays(m) > 1 ? 's' : ''}
          {recup > 0 && <span className="font-medium text-teal-700 dark:text-teal-400"> · +{fmtDays(recup)} de récupération</span>}
        </p>
        {(m.place || m.reason) && (
          <div className="mt-2 space-y-0.5 text-sm">
            {m.place && <p><span className="text-slate-500 dark:text-slate-400">Lieu : </span>{m.place}</p>}
            {m.reason && <p><span className="text-slate-500 dark:text-slate-400">Motif : </span>{m.reason}</p>}
          </div>
        )}
        {m.note && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{m.note}</p>}
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Frais</h2>
          <Button variant="ghost" className="px-2" onClick={() => openFee()}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </div>
        {fees.length === 0 && linked.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">Aucun frais pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            {fees.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => openFee(f)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{FEE_LABELS[f.kind]}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {fmtDate(f.date)}
                      {f.note ? ` · ${f.note}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{fmtDA(f.amount)}</span>
                </button>
              </li>
            ))}
            {linked.map((l, i) => (
              <li key={`l${i}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(l.date)} · rattachée à la mission</p>
                </div>
                <span className="font-semibold tabular-nums">{fmtDA(l.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        {byKind.map(([k, n]) => (
          <Row key={k} label={FEE_LABELS[k]} value={fmtDA(n)} />
        ))}
        {linked.length > 0 && <Row label="Dépenses rattachées" value={fmtDA(linked.reduce((s, l) => s + l.amount, 0))} />}
        <Row label="Total des frais" value={fmtDA(totalFees)} strong />
        <Row label="Remboursé" value={fmtDA(m.reimbursed)} />
        <Row label={rest >= 0 ? 'Reste à rembourser' : 'Trop-perçu'} value={fmtDA(Math.abs(rest))} strong />
      </Card>

      <Button block onClick={() => void exportPdf()} disabled={pdfBusy}>
        <FileDown className="size-5" /> {pdfBusy ? 'Création…' : 'Note de frais (PDF)'}
      </Button>
      <Button block variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="size-4" /> Supprimer la mission
      </Button>

      {fee && <FeeSheet initial={fee} missionId={m.id!} min={m.start} max={m.end} onClose={() => setFee(null)} />}
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer la mission ?">
        <p className="mb-3 text-sm">
          Ses {missionDays(m)} jours redeviendront normaux dans le calendrier, ses frais seront supprimés
          {recup > 0 ? ` et les ${fmtDays(recup)} de récupération retirés` : ''}.
        </p>
        <Button
          block
          variant="danger"
          onClick={async () => {
            await deleteMission(m.id!);
            navigate('/missions', { replace: true });
          }}
        >
          Supprimer
        </Button>
      </Sheet>
    </div>
  );
}
