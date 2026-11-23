import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Baby, Car, Check, CreditCard, PartyPopper, Scale, Upload } from 'lucide-react';
import { db, type BalanceType } from '../db/db';
import { getSettings, setSetting } from '../db/settings';
import { addMonths, fmtDate, todayISO } from '../lib/dates';
import { fmtDA, fmtDays, parseDA, parseNum } from '../lib/format';
import { backupSummary, parseBackup, restoreBackup, type BackupFile } from '../lib/backup';
import { Button, Card, Field, Input, Segmented, Sheet } from '../components/ui';
import { cx } from '../lib/cx';
import { dueInstallments } from '../lib/loan';

/** Date de référence du solde de congé (cahier des charges). */
const DEFAULT_LEAVE_DATE = '2026-11-23';
const DEFAULT_LEAVE_DAYS = '25';

interface Form {
  leaveDays: string;
  leaveDate: string;
  recupDays: string;
  rcDays: string;
  countMode: 'ouvrables' | 'calendaires';

  hasCar: boolean;
  model: string;
  plate: string;
  purchasePrice: string;
  purchaseDate: string;
  downPayment: string;
  km: string;

  hasLoan: boolean;
  loanAmount: string;
  loanMonthly: string;
  loanStart: string;
  loanMonths: string;
  loanPaid: string;
  lender: string;

  hasDaycare: boolean;
  daycareName: string;
  childName: string;
  daycareMonthly: string;
  payDay: string;
}

const EMPTY: Form = {
  leaveDays: DEFAULT_LEAVE_DAYS,
  leaveDate: DEFAULT_LEAVE_DATE,
  recupDays: '0',
  rcDays: '0',
  countMode: 'ouvrables',
  hasCar: true,
  model: '',
  plate: '',
  purchasePrice: '',
  purchaseDate: '',
  downPayment: '',
  km: '',
  hasLoan: false,
  loanAmount: '',
  loanMonthly: '',
  loanStart: '',
  loanMonths: '',
  loanPaid: '',
  lender: '',
  hasDaycare: true,
  daycareName: '',
  childName: '',
  daycareMonthly: '',
  payDay: '5',
};

const str = (n: number | undefined | null) => (n === undefined || n === null ? '' : String(n));

/** Charge les données existantes (si l'assistant est relancé). */
async function loadExisting(): Promise<Form> {
  const f: Form = { ...EMPTY };
  const settings = await getSettings();
  f.countMode = settings.leaveCountMode;
  for (const type of ['conge', 'recup', 'rc'] as BalanceType[]) {
    const m = await db.balanceMoves.where('autoKey').equals(`init-${type}`).first();
    if (!m) continue;
    if (type === 'conge') {
      f.leaveDays = str(m.days);
      f.leaveDate = m.date;
    } else if (type === 'recup') f.recupDays = str(m.days);
    else f.rcDays = str(m.days);
  }
  const v = await db.vehicle.toCollection().first();
  if (v) Object.assign(f, { model: v.model, plate: v.plate ?? '', purchasePrice: str(v.purchasePrice), purchaseDate: v.purchaseDate, downPayment: str(v.downPayment), km: str(v.initialKm) });
  const loan = await db.carLoans.toCollection().first();
  if (loan) {
    const paid = await db.loanPayments.where('loanId').equals(loan.id!).filter((p) => !!p.fromWizard).count();
    Object.assign(f, { hasLoan: true, loanAmount: str(loan.amount), loanMonthly: str(loan.monthly), loanStart: loan.startDate, loanMonths: str(loan.months), loanPaid: str(paid), lender: loan.lender ?? '' });
  }
  const d = await db.daycare.toCollection().first();
  if (d) Object.assign(f, { daycareName: d.name, childName: d.childName ?? '', daycareMonthly: str(d.monthly), payDay: str(d.payDay) });
  return f;
}

async function saveAll(f: Form) {
  const now = Date.now();
  await db.transaction('rw', [db.balanceMoves, db.vehicle, db.carLoans, db.loanPayments, db.daycare, db.settings], async () => {
    // Soldes de départ = mouvements (jamais de total stocké)
    const initial: [BalanceType, number, string][] = [
      ['conge', parseNum(f.leaveDays) || 0, f.leaveDate || DEFAULT_LEAVE_DATE],
      ['recup', parseNum(f.recupDays) || 0, f.leaveDate || DEFAULT_LEAVE_DATE],
      ['rc', parseNum(f.rcDays) || 0, f.leaveDate || DEFAULT_LEAVE_DATE],
    ];
    for (const [type, days, date] of initial) {
      const autoKey = `init-${type}`;
      const existing = await db.balanceMoves.where('autoKey').equals(autoKey).first();
      const move = { type, date, days, origin: 'manuel' as const, reason: 'Solde de départ', autoKey, createdAt: now };
      if (existing) await db.balanceMoves.update(existing.id!, move);
      else await db.balanceMoves.add(move);
    }

    // Voiture
    const v = await db.vehicle.toCollection().first();
    if (f.hasCar && f.model.trim()) {
      const vehicle = {
        model: f.model.trim(),
        plate: f.plate.trim() || undefined,
        purchasePrice: parseDA(f.purchasePrice),
        purchaseDate: f.purchaseDate || todayISO(),
        downPayment: parseDA(f.downPayment),
        initialKm: f.km ? parseDA(f.km) : undefined,
      };
      if (v) await db.vehicle.update(v.id!, vehicle);
      else await db.vehicle.add(vehicle);
    }

    // Crédit + reprise des mensualités déjà payées
    if (f.hasCar && f.hasLoan) {
      const months = Math.max(1, Math.round(parseNum(f.loanMonths) || 0));
      const loan = {
        amount: parseDA(f.loanAmount),
        monthly: parseDA(f.loanMonthly),
        startDate: f.loanStart,
        months,
        lender: f.lender.trim() || undefined,
      };
      const existing = await db.carLoans.toCollection().first();
      let loanId: number;
      if (existing?.id !== undefined) {
        await db.carLoans.update(existing.id, loan);
        loanId = existing.id;
      } else {
        loanId = (await db.carLoans.add(loan)) as number;
      }
      await db.loanPayments.where('loanId').equals(loanId).filter((p) => !!p.fromWizard).delete();
      const paid = Math.min(months, Math.max(0, Math.round(parseNum(f.loanPaid) || 0)));
      await db.loanPayments.bulkAdd(
        Array.from({ length: paid }, (_, k) => ({
          loanId,
          date: addMonths(loan.startDate, k),
          amount: loan.monthly,
          note: 'Reprise (assistant de démarrage)',
          fromWizard: true,
        })),
      );
    }

    // Crèche
    if (f.hasDaycare && (f.daycareName.trim() || f.daycareMonthly)) {
      const d = {
        name: f.daycareName.trim(),
        childName: f.childName.trim() || undefined,
        monthly: parseDA(f.daycareMonthly),
        payDay: Math.min(31, Math.max(1, Math.round(parseNum(f.payDay) || 1))),
      };
      const existing = await db.daycare.toCollection().first();
      if (existing) await db.daycare.update(existing.id!, d);
      else await db.daycare.add({ ...d, startMonth: todayISO().slice(0, 7) });
    }

    await setSetting('leaveCountMode', f.countMode);
    await setSetting('onboarded', true);
  });
}

const STEPS = [
  { title: 'Bienvenue', icon: PartyPopper },
  { title: 'Soldes de départ', icon: Scale },
  { title: 'Voiture', icon: Car },
  { title: 'Crédit voiture', icon: CreditCard },
  { title: 'Crèche', icon: Baby },
  { title: 'Récapitulatif', icon: Check },
];

function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Field label={label} group>
      <Segmented
        value={value ? 'oui' : 'non'}
        onChange={(v) => onChange(v === 'oui')}
        options={[
          { value: 'oui', label: 'Oui' },
          { value: 'non', label: 'Non' },
        ]}
      />
    </Field>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default function Wizard() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadExisting().then(setF);
  }, []);

  if (!f) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const text = (k: keyof Form) => ({
    value: f[k] as string,
    onChange: (e: ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never),
  });

  const validate = (): string => {
    if (step === 1) {
      if (!Number.isFinite(parseNum(f.leaveDays))) return 'Indiquez le solde de congé (ex. : 25).';
      if (!f.leaveDate) return 'Indiquez la date du solde de congé.';
    }
    if (step === 2 && f.hasCar && !f.model.trim()) return 'Indiquez le modèle, ou répondez « Non ».';
    if (step === 3 && f.hasCar && f.hasLoan) {
      if (!parseDA(f.loanAmount) || !parseDA(f.loanMonthly)) return 'Indiquez le montant emprunté et la mensualité.';
      if (!f.loanStart) return 'Indiquez la date de la première mensualité.';
      if (!(parseNum(f.loanMonths) > 0)) return 'Indiquez la durée en mois.';
    }
    if (step === 4 && f.hasDaycare) {
      const d = parseNum(f.payDay);
      if (!(d >= 1 && d <= 31)) return 'Le jour de paiement doit être entre 1 et 31.';
    }
    return '';
  };

  const next = async () => {
    const err = validate();
    setError(err);
    if (err) return;
    if (step === STEPS.length - 1) {
      setSaving(true);
      try {
        await saveAll(f);
      } catch (e) {
        setError(`Enregistrement impossible : ${(e as Error).message}`);
        setSaving(false);
      }
      return;
    }
    // Pas de voiture → on saute l'étape crédit
    setStep(step === 2 && !f.hasCar ? 4 : step + 1);
  };
  const prev = () => {
    setError('');
    setStep(step === 4 && !f.hasCar ? 2 : step - 1);
  };

  const onPickBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPendingBackup(parseBackup(await file.text()));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const loanMonths = Math.round(parseNum(f.loanMonths) || 0);
  const loanPaidNum = Math.min(loanMonths, Math.round(parseNum(f.loanPaid) || 0));
  const loanRemaining = Math.max(0, parseDA(f.loanMonthly) * (loanMonths - loanPaidNum));
  const suggestedPaid = dueInstallments(f.loanStart, loanMonths);
  const StepIcon = STEPS[step].icon;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Progression */}
      <div className="mb-6 flex gap-1.5" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <div key={s.title} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-800')} />
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <StepIcon className="size-6" />
        </span>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Étape {step + 1} / {STEPS.length}
          </p>
          <h1 className="text-xl font-bold">{STEPS[step].title}</h1>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        {step === 0 && (
          <>
            <p className="text-slate-600 dark:text-slate-300">
              Bienvenue dans <strong>Mon Suivi</strong> : dépenses, voiture, crèche, calendrier de travail, missions et soldes de congé.
            </p>
            <Card className="bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900">
              <p className="text-sm">
                🔒 Tout reste <strong>sur ce téléphone</strong>. Aucune donnée n'est envoyée sur Internet. L'app fonctionne hors ligne.
              </p>
            </Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Quelques questions pour démarrer (2 minutes). Tout pourra être modifié ensuite.
            </p>
            <div className="pt-2">
              <p className="mb-2 text-sm font-medium">Vous changez de téléphone ?</p>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onPickBackup(e.target.files?.[0])} />
              <Button variant="secondary" block onClick={() => fileRef.current?.click()}>
                <Upload className="size-5" /> Restaurer une sauvegarde
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Congé (jours)">
                <Input inputMode="decimal" {...text('leaveDays')} />
              </Field>
              <Field label="Au">
                <Input type="date" {...text('leaveDate')} />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              +2,5 j ajoutés automatiquement le dernier jour de chaque mois (30 j par an, du 1er juillet au 30 juin).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Récupération (jours)">
                <Input inputMode="decimal" {...text('recupDays')} />
              </Field>
              <Field label="RC (jours)">
                <Input inputMode="decimal" {...text('rcDays')} />
              </Field>
            </div>
            <Field label="Décompte du congé" group hint="Ouvrables : le week-end et les jours fériés ne sont pas décomptés.">
              <Segmented
                value={f.countMode}
                onChange={(v) => set('countMode', v)}
                options={[
                  { value: 'ouvrables', label: 'Jours ouvrables' },
                  { value: 'calendaires', label: 'Calendaires' },
                ]}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <YesNo label="Avez-vous une voiture ?" value={f.hasCar} onChange={(v) => set('hasCar', v)} />
            {f.hasCar && (
              <>
                <Field label="Modèle">
                  <Input placeholder="Ex. : Renault Symbol" {...text('model')} />
                </Field>
                <Field label="Immatriculation (facultatif)">
                  <Input {...text('plate')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prix d'achat (DA)">
                    <Input inputMode="numeric" {...text('purchasePrice')} />
                  </Field>
                  <Field label="Date d'achat">
                    <Input type="date" {...text('purchaseDate')} />
                  </Field>
                  <Field label="Apport (DA)">
                    <Input inputMode="numeric" {...text('downPayment')} />
                  </Field>
                  <Field label="Kilométrage actuel">
                    <Input inputMode="numeric" {...text('km')} />
                  </Field>
                </div>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <YesNo label="Un crédit voiture est-il en cours ?" value={f.hasLoan} onChange={(v) => set('hasLoan', v)} />
            {f.hasLoan && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Montant emprunté (DA)">
                    <Input inputMode="numeric" {...text('loanAmount')} />
                  </Field>
                  <Field label="Mensualité (DA)">
                    <Input inputMode="numeric" {...text('loanMonthly')} />
                  </Field>
                  <Field label="1re mensualité">
                    <Input type="date" {...text('loanStart')} />
                  </Field>
                  <Field label="Durée (mois)">
                    <Input inputMode="numeric" {...text('loanMonths')} />
                  </Field>
                </div>
                <div>
                  <Field label="Mensualités déjà payées">
                    <Input inputMode="numeric" {...text('loanPaid')} />
                  </Field>
                  {f.loanStart && loanMonths > 0 && (
                    <button
                      type="button"
                      className="mt-1 min-h-8 text-xs font-medium text-emerald-700 underline dark:text-emerald-400"
                      onClick={() => set('loanPaid', String(suggestedPaid))}
                    >
                      Suggestion d'après la date : {suggestedPaid}
                    </button>
                  )}
                </div>
                <Field label="Banque (facultatif)">
                  <Input {...text('lender')} />
                </Field>
                {loanMonths > 0 && parseDA(f.loanMonthly) > 0 && (
                  <Card>
                    <Row label="Mensualités restantes" value={`${loanMonths - loanPaidNum} / ${loanMonths}`} />
                    <Row label="Reste à payer" value={fmtDA(loanRemaining)} />
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <YesNo label="Votre fille va-t-elle à la crèche ?" value={f.hasDaycare} onChange={(v) => set('hasDaycare', v)} />
            {f.hasDaycare && (
              <>
                <Field label="Nom de la crèche">
                  <Input {...text('daycareName')} />
                </Field>
                <Field label="Prénom de l'enfant (facultatif)">
                  <Input {...text('childName')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mensualité (DA)">
                    <Input inputMode="numeric" {...text('daycareMonthly')} />
                  </Field>
                  <Field label="Jour de paiement">
                    <Input inputMode="numeric" {...text('payDay')} />
                  </Field>
                </div>
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <Card>
              <p className="mb-1 font-semibold">Soldes au {fmtDate(f.leaveDate)}</p>
              <Row label="Congé" value={fmtDays(parseNum(f.leaveDays) || 0)} />
              <Row label="Récupération" value={fmtDays(parseNum(f.recupDays) || 0)} />
              <Row label="RC" value={fmtDays(parseNum(f.rcDays) || 0)} />
              <Row label="Décompte" value={f.countMode === 'ouvrables' ? 'Jours ouvrables' : 'Jours calendaires'} />
            </Card>
            <Card>
              <p className="mb-1 font-semibold">Voiture</p>
              {f.hasCar ? (
                <>
                  <Row label="Modèle" value={f.model} />
                  {f.purchasePrice && <Row label="Prix d'achat" value={fmtDA(parseDA(f.purchasePrice))} />}
                  {f.hasLoan ? <Row label="Crédit restant" value={fmtDA(loanRemaining)} /> : <Row label="Crédit" value="Aucun" />}
                </>
              ) : (
                <p className="text-sm text-slate-500">Pas de voiture</p>
              )}
            </Card>
            <Card>
              <p className="mb-1 font-semibold">Crèche</p>
              {f.hasDaycare ? (
                <>
                  <Row label="Crèche" value={f.daycareName || '—'} />
                  <Row label="Mensualité" value={fmtDA(parseDA(f.daycareMonthly))} />
                  <Row label="Paiement" value={`le ${f.payDay} du mois`} />
                </>
              ) : (
                <p className="text-sm text-slate-500">Pas de crèche</p>
              )}
            </Card>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 mt-6 flex gap-2 bg-slate-50 pt-2 dark:bg-slate-950">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onClick={prev} disabled={saving}>
            Retour
          </Button>
        )}
        <Button className="flex-[2]" onClick={() => void next()} disabled={saving}>
          {step === 0 ? 'Commencer' : step === STEPS.length - 1 ? 'Terminer' : 'Suivant'}
        </Button>
      </div>

      <Sheet open={!!pendingBackup} onClose={() => setPendingBackup(null)} title="Restaurer la sauvegarde ?">
        {pendingBackup && (
          <div className="space-y-3">
            <p className="text-sm">
              Sauvegarde du <strong>{fmtDate(pendingBackup.exportedAt.slice(0, 10))}</strong> — {backupSummary(pendingBackup)} éléments.
            </p>
            <Button
              block
              onClick={async () => {
                try {
                  await restoreBackup(pendingBackup);
                } catch (e) {
                  setError(`Restauration impossible : ${(e as Error).message}`);
                }
                setPendingBackup(null);
              }}
            >
              Restaurer
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
