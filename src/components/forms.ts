// Formulaires des modules (champs, valeurs par défaut, calculs), partagés entre les pages et la saisie rapide « + ».
import { db, type Category, type Daycare, type DaycarePaymentType, type FuelEntry } from '../db/db';
import { addMonths, todayISO } from '../lib/dates';
import { parseNum } from '../lib/format';
import { MAINTENANCE_TYPES, MISC_LABELS } from '../lib/car';
import type { FormConfig, FormState, Row } from './RecordList';

export const FUEL_FORM: FormConfig = {
  title: 'Carburant',
  addLabel: 'Nouveau plein',
  table: db.fuel,
  dateKey: 'date',
  fields: [
    { key: 'date', label: 'Date', type: 'date', required: true, half: true },
    { key: 'km', label: 'Kilométrage', type: 'int', required: true, half: true },
    { key: 'liters', label: 'Litres', type: 'decimal', half: true },
    { key: 'pricePerLiter', label: 'Prix / L', type: 'decimal', half: true },
    { key: 'amount', label: 'Montant', type: 'da', required: true, hint: 'Saisissez 2 valeurs sur 3 : la 3e se calcule.' },
    { key: 'full', label: 'Plein complet ?', type: 'bool' },
    { key: 'station', label: 'Station', type: 'text', placeholder: 'Ex. : Naftal Bab Ezzouar' },
    { key: 'missionId', label: 'Mission liée', type: 'mission' },
  ],
  defaults: async () => {
    const last = (await db.fuel.orderBy('date').last()) as FuelEntry | undefined;
    return { date: todayISO(), full: true, pricePerLiter: last?.pricePerLiter, station: last?.station };
  },
  onFieldChange: (f: FormState, key: string) => {
    const l = parseNum(String(f.liters ?? ''));
    const p = parseNum(String(f.pricePerLiter ?? ''));
    const a = parseNum(String(f.amount ?? ''));
    const r2 = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
    if ((key === 'liters' || key === 'pricePerLiter') && l > 0 && p > 0) return { ...f, amount: String(Math.round(l * p)) };
    if ((key === 'amount' || key === 'pricePerLiter') && a > 0 && p > 0 && !(l > 0 && key === 'pricePerLiter')) return { ...f, liters: r2(a / p) };
    if (key === 'amount' && a > 0 && l > 0 && !(p > 0)) return { ...f, pricePerLiter: r2(a / l) };
    return f;
  },
  validate: (r: Row) => {
    const fe = r as unknown as FuelEntry;
    if (!(fe.liters > 0) && fe.amount > 0 && fe.pricePerLiter > 0) (r as Record<string, unknown>).liters = Math.round((fe.amount / fe.pricePerLiter) * 100) / 100;
    if (!((r.liters as number) > 0)) return 'Indiquez les litres (ou le montant et le prix au litre).';
    if (!(fe.amount > 0)) return 'Indiquez le montant.';
    if (!(fe.pricePerLiter > 0)) (r as Record<string, unknown>).pricePerLiter = Math.round((fe.amount / (r.liters as number)) * 100) / 100;
    return null;
  },
};

export const MAINTENANCE_FORM: FormConfig = {
  title: 'Pièces et entretien',
  addLabel: 'Nouvel entretien',
  table: db.maintenance,
  dateKey: 'date',
  fields: [
    { key: 'date', label: 'Date', type: 'date', required: true, half: true },
    { key: 'km', label: 'Kilométrage', type: 'int', half: true },
    { key: 'type', label: 'Type', type: 'text', required: true, suggestions: MAINTENANCE_TYPES, placeholder: 'vidange, pneus…' },
    { key: 'price', label: 'Prix', type: 'da', required: true, half: true },
    { key: 'garage', label: 'Garage', type: 'text', half: true },
    { key: 'note', label: 'Note', type: 'text' },
  ],
  defaults: () => ({ date: todayISO(), type: 'vidange' }),
};

export const MISC_FORM: FormConfig = {
  title: 'Divers voiture',
  addLabel: 'Nouvelle dépense voiture',
  table: db.carMisc,
  dateKey: 'date',
  fields: [
    { key: 'kind', label: 'Type', type: 'select', required: true, options: Object.entries(MISC_LABELS).map(([value, label]) => ({ value, label })) },
    { key: 'date', label: 'Date', type: 'date', required: true, half: true },
    { key: 'amount', label: 'Montant', type: 'da', required: true, half: true },
    { key: 'note', label: 'Note', type: 'text' },
    { key: 'missionId', label: 'Mission liée', type: 'mission' },
  ],
  defaults: () => ({ date: todayISO(), kind: 'lavage' }),
};

export function expenseForm(categories: Category[]): FormConfig {
  return {
    title: 'Dépenses',
    addLabel: 'Nouvelle dépense',
    table: db.expenses,
    dateKey: 'date',
    fields: [
      { key: 'amount', label: 'Montant', type: 'da', required: true, half: true },
      { key: 'date', label: 'Date', type: 'date', required: true, half: true },
      { key: 'categoryId', label: 'Catégorie', type: 'select', numeric: true, required: true, options: categories.map((c) => ({ value: String(c.id), label: c.name })) },
      { key: 'note', label: 'Note', type: 'text', placeholder: 'Ex. : supérette du quartier' },
      { key: 'receipt', label: 'Photo du ticket', type: 'photo' },
      { key: 'missionId', label: 'Mission liée', type: 'mission', hint: 'Rattachée automatiquement si la date tombe pendant une mission.' },
    ],
    defaults: () => ({ date: todayISO(), categoryId: categories[0]?.id }),
    validate: (r: Row) => (!((r.amount as number) > 0) ? 'Indiquez le montant.' : null),
  };
}

export const DAYCARE_TYPES: Record<DaycarePaymentType, string> = {
  mensualite: 'Mensualité',
  inscription: 'Inscription',
  repas: 'Repas',
  sortie: 'Sortie',
  autre: 'Autre',
};

export function daycarePaymentForm(daycare?: Daycare): FormConfig {
  return {
    title: 'Paiements crèche',
    addLabel: 'Nouveau paiement crèche',
    table: db.daycarePayments,
    dateKey: 'date',
    fields: [
      { key: 'type', label: 'Type', type: 'select', required: true, options: Object.entries(DAYCARE_TYPES).map(([value, label]) => ({ value, label })) },
      { key: 'month', label: 'Mois concerné', type: 'month', required: true, half: true },
      { key: 'amount', label: 'Montant', type: 'da', required: true, half: true },
      { key: 'date', label: 'Date du paiement', type: 'date', required: true },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    defaults: () => ({ type: 'mensualite', month: todayISO().slice(0, 7), amount: daycare?.monthly || undefined, date: todayISO() }),
    validate: (r: Row) => (!((r.amount as number) > 0) ? 'Indiquez le montant.' : null),
  };
}

/** Mois suivant au format AAAA-MM. */
export const nextMonth = (m: string) => addMonths(`${m}-01`, 1).slice(0, 7);
