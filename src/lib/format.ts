const daFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Montant en dinars, sans décimales : « 12 345 DA » */
export function fmtDA(n: number | undefined | null): string {
  return `${daFmt.format(Math.round(n ?? 0))} DA`;
}

/** Nombre de jours : « 27,5 j » */
export function fmtDays(n: number): string {
  return `${numFmt.format(n)} j`;
}

export function fmtNum(n: number): string {
  return numFmt.format(n);
}

/** Accepte « 2,5 », « 2.5 », « 12 000 ». Renvoie NaN si vide/invalide. */
export function parseNum(s: string): number {
  const clean = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (clean === '') return NaN;
  return Number(clean);
}

/** Montant DA : entier, jamais négatif ni NaN. */
export function parseDA(s: string): number {
  const n = parseNum(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Évolution en % (null si la base est nulle). */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}
