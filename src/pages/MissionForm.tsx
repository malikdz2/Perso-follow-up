import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings } from '../db/settings';
import { WILAYAS } from '../data/wilayas';
import { fmtDate, todayISO } from '../lib/dates';
import { confirmedHolidaySet } from '../lib/engine';
import { fmtDays, parseDA } from '../lib/format';
import { conflictingDays, saveMission } from '../lib/missions';
import { dateRange, isNonWorking } from '../lib/rules';
import { STATUS_META } from '../lib/status';
import { Button, Field, Input, PageHeader, Select } from '../components/ui';

interface Form {
  start: string;
  end: string;
  wilaya: string;
  place: string;
  reason: string;
  reimbursed: string;
  note: string;
}

export default function MissionForm() {
  const { id } = useParams();
  const missionId = id ? Number(id) : undefined;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const [f, setF] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      if (missionId !== undefined) {
        const m = await db.missions.get(missionId);
        if (!m) return navigate('/missions', { replace: true });
        setF({ start: m.start, end: m.end, wilaya: String(m.wilaya), place: m.place, reason: m.reason, reimbursed: m.reimbursed ? String(m.reimbursed) : '', note: m.note ?? '' });
      } else {
        const today = todayISO();
        setF({ start: today, end: today, wilaya: params.get('wilaya') ?? '', place: '', reason: '', reimbursed: '', note: '' });
      }
    })();
  }, [missionId, navigate, params]);

  const valid = !!f && !!f.start && !!f.end && f.start <= f.end;
  const conflicts = useLiveQuery(() => (valid ? conflictingDays(f!.start, f!.end, missionId) : []), [f?.start, f?.end, missionId, valid]);
  const holidays = useLiveQuery(confirmedHolidaySet);

  if (!f || !settings) return null;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const days = valid ? dateRange(f.start, f.end) : [];
  const offDays = holidays ? days.filter((d) => isNonWorking(d, holidays)).length : 0;

  const save = async () => {
    if (!valid) return setError('La date de fin doit être après la date de début.');
    if (!f.wilaya) return setError('Choisissez la wilaya.');
    if (days.length > 366) return setError('Une mission ne peut pas dépasser un an.');
    setSaving(true);
    try {
      const mid = await saveMission(
        { start: f.start, end: f.end, wilaya: Number(f.wilaya), place: f.place.trim(), reason: f.reason.trim(), reimbursed: parseDA(f.reimbursed), note: f.note.trim() || undefined },
        missionId,
      );
      navigate(`/missions/${mid}`, { replace: true });
    } catch (e) {
      setError(`Enregistrement impossible : ${(e as Error).message}`);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={missionId ? 'Modifier la mission' : 'Nouvelle mission'} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début">
          <Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, end: !f.end || f.end < e.target.value ? e.target.value : f.end })} />
        </Field>
        <Field label="Fin">
          <Input type="date" value={f.end} min={f.start} onChange={set('end')} />
        </Field>
      </div>
      {valid && (
        <p className="-mt-2 text-sm text-slate-600 dark:text-slate-300">
          {days.length} jour{days.length > 1 ? 's' : ''}
          {offDays > 0 && (
            <>
              {' '}
              dont {offDays} vendredi/samedi/férié →{' '}
              <strong className="text-teal-700 dark:text-teal-400">+{fmtDays(offDays * settings.recupRatio)} de récupération</strong>
            </>
          )}
        </p>
      )}
      <Field label="Wilaya">
        <Select value={f.wilaya} onChange={set('wilaya')}>
          <option value="">Choisir…</option>
          {WILAYAS.map((w) => (
            <option key={w.code} value={w.code}>
              {String(w.code).padStart(2, '0')} — {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lieu">
        <Input value={f.place} onChange={set('place')} placeholder="Ex. : Direction régionale, Hassi Messaoud" />
      </Field>
      <Field label="Motif">
        <Input value={f.reason} onChange={set('reason')} placeholder="Ex. : audit, formation, chantier" />
      </Field>
      <Field label="Montant remboursé (DA)" hint="Vous pourrez le compléter plus tard.">
        <Input inputMode="numeric" value={f.reimbursed} onChange={set('reimbursed')} />
      </Field>
      <Field label="Note (facultatif)">
        <Input value={f.note} onChange={set('note')} />
      </Field>

      {conflicts && conflicts.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="font-semibold">{conflicts.length} jour{conflicts.length > 1 ? 's' : ''} déjà posé{conflicts.length > 1 ? 's' : ''} seront remplacés par « Mission » :</p>
          <p>{conflicts.map((d) => `${fmtDate(d.date)} (${STATUS_META[d.status].label}${d.missionId ? ', autre mission' : ''})`).join(', ')}</p>
          <p className="mt-1 text-xs">Les soldes seront recalculés automatiquement.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <Button block onClick={() => void save()} disabled={saving}>
        {missionId ? 'Enregistrer' : 'Créer la mission'}
      </Button>
    </div>
  );
}
