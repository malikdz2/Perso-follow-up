// Saisie rapide : « 3000 plein », « 1500 courses », « crèche 8000 » → module + montant.
// Fonctions PURES, couvertes par les tests.
import { addDays, pad, type ISODate } from './dates';

export interface Keyword {
  word: string;
  target: string;
}

export interface ParsedEntry {
  amount?: number;
  liters?: number;
  km?: number;
  date: ISODate;
  /** Cible du mot-clé reconnu : 'fuel', 'daycare', 'maintenance', 'carMisc:<type>', 'expense:<idCatégorie>' */
  target?: string;
  keyword?: string;
  /** Le reste de la phrase (sans montant ni date), utilisé comme note. */
  note: string;
}

/** Minuscules sans accents : « Crèche » → « creche ». */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ');

const NUMBER = String.raw`(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[.,](\d+))?`;

function toNumber(intPart: string, dec?: string): number {
  return Number(intPart.replace(/[   .]/g, '') + (dec ? `.${dec}` : ''));
}

/** Trouve le mot-clé : correspondance exacte d'un mot > début de mot ; le plus long gagne. */
export function matchKeyword(text: string, keywords: Keyword[]): Keyword | undefined {
  const norm = normalize(text);
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  let best: { kw: Keyword; score: number } | undefined;
  for (const kw of keywords) {
    const w = normalize(kw.word).trim();
    if (!w) continue;
    let score = 0;
    if (w.includes(' ')) {
      if (` ${tokens.join(' ')} `.includes(` ${w} `)) score = 1000 + w.length;
    } else if (tokens.includes(w)) score = 1000 + w.length;
    else if (w.length >= 4 && tokens.some((t) => t.startsWith(w))) score = 500 + w.length;
    if (score && (!best || score > best.score)) best = { kw, score };
  }
  return best?.kw;
}

/** Analyse une phrase courte. `today` est injecté pour les tests. */
export function parseQuickEntry(input: string, keywords: Keyword[], today: ISODate): ParsedEntry {
  let rest = ` ${input.trim()} `;
  const out: ParsedEntry = { date: today, note: '' };

  // Date : « hier », « avant-hier », « 12/11 », « 12/11/2026 »
  const dm = rest.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s)/);
  if (dm) {
    const y = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
    out.date = `${y}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    rest = rest.replace(dm[0], ' ');
  } else if (/\savant[- ]hier(?=\s)/i.test(rest)) {
    out.date = addDays(today, -2);
    rest = rest.replace(/\savant[- ]hier(?=\s)/i, ' ');
  } else if (/\shier(?=\s)/i.test(rest)) {
    out.date = addDays(today, -1);
    rest = rest.replace(/\shier(?=\s)/i, ' ');
  }

  // Kilométrage « 36500 km » et litres « 40 L » / « 40 litres »
  const km = rest.match(new RegExp(String.raw`\s${NUMBER}\s*km(?=\s)`, 'i'));
  if (km) {
    out.km = toNumber(km[1], km[2]);
    rest = rest.replace(km[0], ' ');
  }
  const lit = rest.match(new RegExp(String.raw`\s${NUMBER}\s*(?:l|litres?)(?=\s)`, 'i'));
  if (lit) {
    out.liters = toNumber(lit[1], lit[2]);
    rest = rest.replace(lit[0], ' ');
  }

  // Montant : premier nombre restant, « 1,5k » = 1 500, « 3000 DA »
  const am = rest.match(new RegExp(String.raw`\s${NUMBER}\s*(k|da|dzd|dinars?)?(?=\s)`, 'i'));
  if (am) {
    let n = toNumber(am[1], am[2]);
    if (am[3]?.toLowerCase() === 'k') n *= 1000;
    out.amount = Math.round(n);
    rest = rest.replace(am[0], ' ');
  }

  const kw = matchKeyword(rest, keywords);
  if (kw) {
    out.target = kw.target;
    out.keyword = kw.word;
  }
  out.note = rest.replace(/\s+/g, ' ').trim();
  return out;
}

/** Libellé lisible d'une cible de mot-clé. */
export function targetLabel(target: string, categoryName: (id: number) => string | undefined): string {
  if (target === 'fuel') return 'Carburant';
  if (target === 'daycare') return 'Crèche';
  if (target === 'maintenance') return 'Entretien voiture';
  if (target.startsWith('carMisc:')) {
    const k = target.slice(8);
    return `Voiture — ${{ lavage: 'Lavage', parking: 'Parking', amende: 'Amende', peage: 'Péage', autre: 'Divers' }[k] ?? k}`;
  }
  if (target.startsWith('expense:')) return `Dépense — ${categoryName(Number(target.slice(8))) ?? 'catégorie supprimée'}`;
  return target;
}
