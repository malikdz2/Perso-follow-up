import Dexie, { type EntityTable } from 'dexie';
import type { ISODate } from '../lib/dates';

// ───────────────────────── Types ─────────────────────────

export interface Setting {
  key: string;
  value: unknown;
}

// Soldes : seule source de vérité. Aucun total stocké.
export type BalanceType = 'conge' | 'recup' | 'rc';
export type MoveOrigin = 'auto' | 'calendrier' | 'manuel';
export interface BalanceMove {
  id?: number;
  type: BalanceType;
  date: ISODate;
  days: number; // + acquis / − pris
  origin: MoveOrigin;
  reason: string;
  /** Clé unique des mouvements générés (idempotence : jamais ajoutés deux fois). */
  autoKey?: string;
  createdAt: number;
}

// Calendrier
export type DayStatus =
  | 'travail' | 'mission' | 'rc' | 'conge' | 'recup' | 'weekend' | 'ferie' | 'absence';
export interface DayEntry {
  date: ISODate; // clé primaire
  status: DayStatus;
  missionId?: number;
  note?: string;
}
export interface Holiday {
  id?: number;
  date: ISODate;
  name: string;
  kind: 'civile' | 'religieuse';
  confirmed: boolean;
}

// Missions
export interface Mission {
  id?: number;
  start: ISODate;
  end: ISODate;
  wilaya: number; // code 1..69
  place: string;
  reason: string;
  reimbursed: number; // DA
  note?: string;
}
export type MissionFeeKind = 'hebergement' | 'repas' | 'carburant' | 'autre';
export interface MissionFee {
  id?: number;
  missionId: number;
  date: ISODate;
  kind: MissionFeeKind;
  amount: number;
  note?: string;
}

// Voiture
export interface Vehicle {
  id?: number;
  model: string;
  plate?: string;
  purchasePrice: number;
  purchaseDate: ISODate;
  downPayment: number;
  initialKm?: number;
}
export interface CarLoan {
  id?: number;
  amount: number;
  monthly: number;
  startDate: ISODate;
  months: number;
  lender?: string;
}
export interface LoanPayment {
  id?: number;
  loanId: number;
  date: ISODate;
  amount: number;
  note?: string;
  /** Paiement généré par l'assistant (reprise de l'historique). */
  fromWizard?: boolean;
}
export interface FuelEntry {
  id?: number;
  date: ISODate;
  liters: number;
  pricePerLiter: number;
  amount: number;
  km: number;
  full: boolean;
  station?: string;
  missionId?: number;
}
export interface Insurance {
  id?: number;
  company: string;
  formula: string;
  amount: number;
  start: ISODate;
  end: ISODate;
}
export interface Maintenance {
  id?: number;
  date: ISODate;
  type: string; // vidange, filtres, pneus, plaquettes, batterie, autre…
  km?: number;
  garage?: string;
  price: number;
  note?: string;
}
export interface Accessory {
  id?: number;
  date: ISODate;
  item: string;
  price: number;
}
export interface CarCheck {
  id?: number;
  kind: 'controle' | 'vignette';
  date: ISODate;
  expires: ISODate;
  price: number;
  note?: string;
}
export interface CarDoc {
  id?: number;
  kind: 'carte_grise' | 'assurance' | 'permis' | 'autre';
  label: string;
  blob: Blob;
  addedAt: number;
}
export interface CarMisc {
  id?: number;
  date: ISODate;
  kind: 'lavage' | 'parking' | 'amende' | 'peage' | 'autre';
  amount: number;
  note?: string;
  missionId?: number;
}

// Dépenses
export interface Category {
  id?: number;
  name: string;
  color: string;
  budget: number; // budget mensuel DA (0 = aucun)
  order: number;
}
export interface Expense {
  id?: number;
  date: ISODate;
  amount: number;
  categoryId: number;
  note?: string;
  receipt?: Blob;
  missionId?: number;
}

// Crèche
export interface Daycare {
  id?: number;
  name: string;
  childName?: string;
  monthly: number;
  payDay: number; // 1..31
  /** Premier mois de crèche (AAAA-MM) : les mois précédents ne sont pas « à payer ». */
  startMonth?: string;
}
export type DaycarePaymentType = 'mensualite' | 'inscription' | 'repas' | 'sortie' | 'autre';
export interface DaycarePayment {
  id?: number;
  date: ISODate;
  month: string; // AAAA-MM concerné
  amount: number;
  type: DaycarePaymentType;
  note?: string;
}

// Saisie rapide : mots-clés → module
export interface KeywordRule {
  id?: number;
  word: string;
  /** 'fuel' | 'daycare' | 'maintenance' | 'carMisc:<kind>' | 'expense:<categoryId>' */
  target: string;
}

// Récapitulatifs mensuels figés
export interface Recap {
  month: string; // AAAA-MM
  createdAt: number;
  /** Figé (mois terminé) ; provisoire le dernier jour du mois. */
  final: boolean;
  /** Date de première consultation (rappel « récap prêt »). */
  viewedAt?: number;
  data: unknown;
}

// État des rappels (dernière notification, report…)
export interface ReminderState {
  key: string;
  lastNotified?: ISODate;
  snoozedUntil?: ISODate;
}

// ───────────────────────── Base ─────────────────────────

export class AppDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>;
  balanceMoves!: EntityTable<BalanceMove, 'id'>;
  days!: EntityTable<DayEntry, 'date'>;
  holidays!: EntityTable<Holiday, 'id'>;
  missions!: EntityTable<Mission, 'id'>;
  missionFees!: EntityTable<MissionFee, 'id'>;
  vehicle!: EntityTable<Vehicle, 'id'>;
  carLoans!: EntityTable<CarLoan, 'id'>;
  loanPayments!: EntityTable<LoanPayment, 'id'>;
  fuel!: EntityTable<FuelEntry, 'id'>;
  insurances!: EntityTable<Insurance, 'id'>;
  maintenance!: EntityTable<Maintenance, 'id'>;
  accessories!: EntityTable<Accessory, 'id'>;
  carChecks!: EntityTable<CarCheck, 'id'>;
  carDocs!: EntityTable<CarDoc, 'id'>;
  carMisc!: EntityTable<CarMisc, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  daycare!: EntityTable<Daycare, 'id'>;
  daycarePayments!: EntityTable<DaycarePayment, 'id'>;
  keywords!: EntityTable<KeywordRule, 'id'>;
  recaps!: EntityTable<Recap, 'month'>;
  reminders!: EntityTable<ReminderState, 'key'>;

  constructor(name = 'mon-suivi') {
    super(name);
    this.version(1).stores({
      settings: 'key',
      balanceMoves: '++id, type, date, origin, &autoKey',
      days: 'date, status, missionId',
      holidays: '++id, date, kind',
      missions: '++id, start, end, wilaya',
      missionFees: '++id, missionId, date',
      vehicle: '++id',
      carLoans: '++id',
      loanPayments: '++id, loanId, date',
      fuel: '++id, date, missionId',
      insurances: '++id, end',
      maintenance: '++id, date, type',
      accessories: '++id, date',
      carChecks: '++id, kind, expires',
      carDocs: '++id, kind',
      carMisc: '++id, date, kind, missionId',
      categories: '++id, order',
      expenses: '++id, date, categoryId, missionId',
      daycare: '++id',
      daycarePayments: '++id, date, month',
      keywords: '++id, word',
      recaps: 'month',
      reminders: 'key',
    });

    this.on('populate', (tx) => seed(tx.table('categories'), tx.table('keywords')));
  }
}

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Alimentation', color: '#16a34a', budget: 0, order: 1 },
  { name: 'Factures', color: '#2563eb', budget: 0, order: 2 },
  { name: 'Santé', color: '#dc2626', budget: 0, order: 3 },
  { name: 'Transport', color: '#ea580c', budget: 0, order: 4 },
  { name: 'Vêtements', color: '#9333ea', budget: 0, order: 5 },
  { name: 'Maison', color: '#0891b2', budget: 0, order: 6 },
  { name: 'Loisirs', color: '#db2777', budget: 0, order: 7 },
  { name: 'Divers', color: '#64748b', budget: 0, order: 8 },
];

/** Mots-clés par défaut (modifiables dans les Réglages). Les ids de catégories suivent DEFAULT_CATEGORIES. */
export const DEFAULT_KEYWORDS: Omit<KeywordRule, 'id'>[] = [
  ...['plein', 'essence', 'gasoil', 'gazoil', 'carburant', 'sirghaz', 'gpl', 'naftal'].map((word) => ({ word, target: 'fuel' })),
  ...['crèche', 'creche', 'garderie'].map((word) => ({ word, target: 'daycare' })),
  ...['vidange', 'filtre', 'pneu', 'pneus', 'plaquettes', 'batterie', 'garage', 'mécanicien'].map((word) => ({ word, target: 'maintenance' })),
  { word: 'lavage', target: 'carMisc:lavage' },
  { word: 'parking', target: 'carMisc:parking' },
  { word: 'amende', target: 'carMisc:amende' },
  { word: 'péage', target: 'carMisc:peage' },
  ...['courses', 'supérette', 'superette', 'marché', 'pain', 'épicerie', 'boucherie', 'fruits', 'légumes'].map((word) => ({ word, target: 'expense:1' })),
  ...['sonelgaz', 'électricité', 'eau', 'internet', 'téléphone', 'flexy', 'facture', 'loyer'].map((word) => ({ word, target: 'expense:2' })),
  ...['pharmacie', 'médecin', 'médicaments', 'analyses', 'dentiste'].map((word) => ({ word, target: 'expense:3' })),
  ...['taxi', 'bus', 'train', 'yassir', 'tram'].map((word) => ({ word, target: 'expense:4' })),
  ...['vêtements', 'chaussures', 'habits'].map((word) => ({ word, target: 'expense:5' })),
  ...['meuble', 'ménage', 'bricolage'].map((word) => ({ word, target: 'expense:6' })),
  ...['restaurant', 'café', 'cinéma', 'sortie', 'resto'].map((word) => ({ word, target: 'expense:7' })),
];

async function seed(categories: Dexie.Table, keywords: Dexie.Table) {
  await categories.bulkAdd(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 })));
  await keywords.bulkAdd(DEFAULT_KEYWORDS);
}

export const db = new AppDB();
