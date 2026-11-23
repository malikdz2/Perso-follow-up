import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Baby, Briefcase, CalendarDays, Fuel, Scale, Sparkles, Wallet, Wand2, Wrench } from 'lucide-react';
import { db } from '../db/db';
import { WILAYA_BY_CODE } from '../data/wilayas';
import { fmtDate, todayISO } from '../lib/dates';
import { fmtDA } from '../lib/format';
import { MAINTENANCE_TYPES } from '../lib/car';
import { expensesByCategory } from '../lib/expenses';
import { normalize, parseQuickEntry, targetLabel, type ParsedEntry } from '../lib/quickparse';
import { FUEL_FORM, MAINTENANCE_FORM, MISC_FORM, daycarePaymentForm, expenseForm } from './forms';
import { RecordSheet, type FormConfig, type FormState, type Row } from './RecordList';
import { toForm } from './recordForm';
import { Button, Input, Sheet } from './ui';

interface OpenForm {
  config: FormConfig;
  form: FormState;
  banner?: ReactNode;
  label: string;
}

/**
 * Saisie unique : on choisit le type, ou on tape une phrase courte (« 3000 plein », « 1500 courses »,
 * « crèche 8000 ») rangée par mots-clés, puis on CONFIRME dans le formulaire pré-rempli.
 */
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [current, setCurrent] = useState<OpenForm | null>(null);
  const [toast, setToast] = useState('');
  const ctx = useLiveQuery(async () => ({
    keywords: await db.keywords.toArray(),
    categories: await db.categories.orderBy('order').toArray(),
    daycare: await db.daycare.toCollection().first(),
  }));

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!ctx) return null;
  const catName = (id: number) => ctx.categories.find((c) => c.id === id)?.name;

  /** Ouvre le formulaire d'un module, pré-rempli. */
  const openForm = async (config: FormConfig, values: Record<string, unknown>, label: string, banner?: ReactNode) => {
    let form = toForm(config.fields, { ...(await config.defaults()), ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== '')) });
    // Carburant : calcule les litres à partir du montant et du dernier prix au litre.
    if (config === FUEL_FORM && values.amount && !values.liters && config.onFieldChange) form = config.onFieldChange(form, 'amount');
    setCurrent({ config, form, banner, label });
  };

  const fromParsed = async (p: ParsedEntry) => {
    const base = { date: p.date };
    const amountTxt = p.amount ? ` — ${fmtDA(p.amount)}` : '';
    const dateTxt = p.date !== todayISO() ? ` le ${fmtDate(p.date)}` : '';
    const ok = (label: string) => (
      <>
        Compris : <strong>{label}</strong>
        {amountTxt}
        {dateTxt} {p.keyword && <span className="opacity-75">(mot-clé « {p.keyword} »)</span>}. Vérifiez puis enregistrez.
      </>
    );
    const t = p.target;
    if (t === 'fuel') return openForm(FUEL_FORM, { ...base, amount: p.amount, liters: p.liters, km: p.km }, 'Carburant', ok('Carburant'));
    if (t === 'maintenance') {
      const k = normalize(p.keyword ?? '');
      const type = MAINTENANCE_TYPES.find((m) => normalize(m).startsWith(k) || k.startsWith(normalize(m)));
      return openForm(MAINTENANCE_FORM, { ...base, price: p.amount, km: p.km, type: type ?? p.keyword, note: p.note }, 'Entretien', ok('Entretien voiture'));
    }
    if (t?.startsWith('carMisc:')) return openForm(MISC_FORM, { ...base, kind: t.slice(8), amount: p.amount, note: p.note }, 'Voiture', ok(targetLabel(t, catName)));
    if (t === 'daycare') return openForm(daycarePaymentForm(ctx.daycare), { ...base, month: p.date.slice(0, 7), amount: p.amount, type: 'mensualite' }, 'Crèche', ok('Crèche'));
    const cats = expenseForm(ctx.categories);
    if (t?.startsWith('expense:') && catName(Number(t.slice(8))))
      return openForm(cats, { ...base, amount: p.amount, categoryId: Number(t.slice(8)), note: p.note }, 'Dépense', ok(targetLabel(t, catName)));
    return openForm(
      cats,
      { ...base, amount: p.amount, categoryId: '', note: p.note },
      'Dépense',
      <>
        Type non reconnu{amountTxt} : choisissez la catégorie. Astuce : ajoutez ce mot dans Réglages → Mots-clés.
      </>,
    );
  };

  const submit = () => {
    if (!text.trim()) return;
    void fromParsed(parseQuickEntry(text, ctx.keywords, todayISO()));
  };

  /** Message après enregistrement : mission rattachée, alerte de budget. */
  const onSaved = async (row: Row, label: string) => {
    let msg = `✓ Enregistré : ${label}${row.amount || row.price ? ` — ${fmtDA(Number(row.amount ?? row.price))}` : ''}`;
    if (row.missionId !== undefined) {
      const m = await db.missions.get(Number(row.missionId));
      if (m) msg += ` · rattaché à la mission ${WILAYA_BY_CODE.get(m.wilaya)?.name ?? ''}`;
    }
    if (row.categoryId !== undefined) {
      const { rows } = await expensesByCategory(String(row.date).slice(0, 7));
      const c = rows.find((r) => r.category.id === row.categoryId);
      if (c && (c.level === 'warn' || c.level === 'over')) msg += ` · ${c.level === 'over' ? '⛔' : '⚠️'} ${c.category.name} : ${Math.round(c.ratio * 100)} % du budget`;
    }
    setToast(msg);
  };

  const close = () => {
    setText('');
    onClose();
  };

  const types: { label: string; icon: typeof Wallet; run: () => void }[] = [
    { label: 'Dépense', icon: Wallet, run: () => void openForm(expenseForm(ctx.categories), {}, 'Dépense') },
    { label: 'Carburant', icon: Fuel, run: () => void openForm(FUEL_FORM, {}, 'Carburant') },
    { label: 'Entretien voiture', icon: Wrench, run: () => void openForm(MAINTENANCE_FORM, {}, 'Entretien') },
    { label: 'Lavage, parking…', icon: Sparkles, run: () => void openForm(MISC_FORM, {}, 'Voiture') },
    { label: 'Crèche', icon: Baby, run: () => void openForm(daycarePaymentForm(ctx.daycare), {}, 'Crèche') },
    { label: 'Mission', icon: Briefcase, run: () => (close(), navigate('/missions/nouvelle')) },
    { label: 'Jour (calendrier)', icon: CalendarDays, run: () => (close(), navigate('/calendrier')) },
    { label: 'RC gagné', icon: Scale, run: () => (close(), navigate('/soldes?ajout=rc')) },
  ];

  return (
    <>
      <Sheet open={open && !current} onClose={close} title="Nouvelle saisie">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex gap-2"
        >
          <Input
            autoFocus
            enterKeyHint="go"
            placeholder="Ex. : 3000 plein, 1500 courses, crèche 8000"
            aria-label="Saisie rapide"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" aria-label="Analyser la phrase" disabled={!text.trim()} className="shrink-0 px-3">
            <Wand2 className="size-5" />
          </Button>
        </form>
        <p className="mt-1 mb-4 text-xs text-slate-500 dark:text-slate-400">Montant + mot-clé, dans n'importe quel ordre. « hier » ou « 12/11 » pour une autre date.</p>
        <div className="grid grid-cols-2 gap-2">
          {types.map(({ label, icon: Icon, run }) => (
            <button key={label} type="button" onClick={run} className="flex min-h-14 items-center gap-2 rounded-xl bg-slate-100 px-3 text-left text-sm font-medium active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700">
              <Icon className="size-5 shrink-0 text-emerald-600" />
              {label}
            </button>
          ))}
        </div>
      </Sheet>

      {open && current && (
        <RecordSheet
          key={current.label + JSON.stringify(current.form)}
          config={current.config}
          initial={{ form: current.form }}
          banner={current.banner}
          onSaved={(row) => void onSaved(row, current.label)}
          onClose={() => {
            setCurrent(null);
            close();
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-40 mx-auto max-w-md px-4">
          <p className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">{toast}</p>
        </div>
      )}
    </>
  );
}
