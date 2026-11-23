import { addMonths, todayISO } from './dates';

/** Nombre de mensualités échues (date ≤ aujourd'hui) depuis le début du crédit. */
export function dueInstallments(start: string, months: number, today = todayISO()): number {
  if (!start || !months) return 0;
  let n = 0;
  while (n < months && addMonths(start, n) <= today) n++;
  return n;
}
