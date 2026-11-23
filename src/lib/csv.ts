// Export CSV par module : séparateur « ; » et virgule décimale (Excel en français), UTF-8 avec BOM.
import { db } from '../db/db';
import { WILAYA_BY_CODE } from '../data/wilayas';
import { fmtDate } from './dates';
import { FEE_LABELS } from './missions';
import { CHECK_LABELS, MISC_LABELS } from './car';

export type Cell = string | number | boolean | null | undefined;

export function toCSV(headers: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'oui' : 'non') : v;
    if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const d = (iso?: string) => (iso ? fmtDate(iso) : '');

export interface CsvModule {
  key: string;
  label: string;
  build: () => Promise<{ headers: string[]; rows: Cell[][] }>;
}

export const CSV_MODULES: CsvModule[] = [
  {
    key: 'depenses',
    label: 'Dépenses',
    build: async () => {
      const cats = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]));
      const rows = (await db.expenses.orderBy('date').toArray()).map((e) => [d(e.date), e.amount, cats.get(e.categoryId) ?? '', e.note, e.missionId !== undefined ? 'oui' : '', e.receipt ? 'oui' : '']);
      return { headers: ['Date', 'Montant (DA)', 'Catégorie', 'Note', 'Mission', 'Ticket photo'], rows };
    },
  },
  {
    key: 'carburant',
    label: 'Carburant',
    build: async () => ({
      headers: ['Date', 'Kilométrage', 'Litres', 'Prix/L', 'Montant (DA)', 'Plein complet', 'Station', 'Mission'],
      rows: (await db.fuel.orderBy('date').toArray()).map((f) => [d(f.date), f.km, f.liters, f.pricePerLiter, f.amount, f.full, f.station, f.missionId !== undefined ? 'oui' : '']),
    }),
  },
  {
    key: 'entretien',
    label: 'Entretien voiture',
    build: async () => ({
      headers: ['Date', 'Type', 'Kilométrage', 'Garage', 'Prix (DA)', 'Note'],
      rows: (await db.maintenance.orderBy('date').toArray()).map((m) => [d(m.date), m.type, m.km, m.garage, m.price, m.note]),
    }),
  },
  {
    key: 'voiture-divers',
    label: 'Voiture : accessoires, divers, assurance, contrôles',
    build: async () => {
      const rows: Cell[][] = [
        ...(await db.accessories.toArray()).map((a) => [d(a.date), 'Accessoire', a.item, a.price]),
        ...(await db.carMisc.toArray()).map((m) => [d(m.date), MISC_LABELS[m.kind], m.note, m.amount]),
        ...(await db.insurances.toArray()).map((i) => [d(i.start), 'Assurance', `${i.company} ${i.formula} (jusqu'au ${d(i.end)})`, i.amount]),
        ...(await db.carChecks.toArray()).map((c) => [d(c.date), CHECK_LABELS[c.kind], `jusqu'au ${d(c.expires)}`, c.price]),
      ];
      return { headers: ['Date', 'Type', 'Détail', 'Montant (DA)'], rows: rows.sort((a, b) => String(a[0]).split('/').reverse().join('').localeCompare(String(b[0]).split('/').reverse().join(''))) };
    },
  },
  {
    key: 'credit',
    label: 'Crédit voiture (paiements)',
    build: async () => ({ headers: ['Date', 'Montant (DA)', 'Note'], rows: (await db.loanPayments.orderBy('date').toArray()).map((p) => [d(p.date), p.amount, p.note]) }),
  },
  {
    key: 'creche',
    label: 'Crèche (paiements)',
    build: async () => ({
      headers: ['Date', 'Mois concerné', 'Type', 'Montant (DA)', 'Note'],
      rows: (await db.daycarePayments.orderBy('date').toArray()).map((p) => [d(p.date), p.month.split('-').reverse().join('/'), p.type, p.amount, p.note]),
    }),
  },
  {
    key: 'missions',
    label: 'Missions et frais',
    build: async () => {
      const fees = await db.missionFees.toArray();
      const rows = (await db.missions.orderBy('start').toArray()).map((m) => {
        const f = fees.filter((x) => x.missionId === m.id);
        const by = (k: keyof typeof FEE_LABELS) => f.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0);
        return [d(m.start), d(m.end), String(m.wilaya).padStart(2, '0'), WILAYA_BY_CODE.get(m.wilaya)?.name, m.place, m.reason, by('hebergement'), by('repas'), by('carburant'), by('autre'), m.reimbursed];
      });
      return { headers: ['Début', 'Fin', 'Code wilaya', 'Wilaya', 'Lieu', 'Motif', 'Hébergement', 'Repas', 'Carburant', 'Autre', 'Remboursé'], rows };
    },
  },
  {
    key: 'calendrier',
    label: 'Calendrier (jours saisis)',
    build: async () => ({ headers: ['Date', 'Statut', 'Note'], rows: (await db.days.orderBy('date').toArray()).map((x) => [d(x.date), x.status, x.note]) }),
  },
  {
    key: 'soldes',
    label: 'Soldes (mouvements)',
    build: async () => ({
      headers: ['Date', 'Compteur', 'Jours', 'Origine', 'Motif'],
      rows: (await db.balanceMoves.orderBy('date').toArray()).map((m) => [d(m.date), m.type, m.days, m.origin, m.reason]),
    }),
  },
];
